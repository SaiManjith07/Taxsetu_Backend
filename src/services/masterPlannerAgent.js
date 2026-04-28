/**
 * Master Planner Agent – Central orchestration for TaxSetu.
 * Coordinates Watcher, Calculator, Filer, Guardian, Narrator; runs workflows,
 * handles dependencies, retries, and observability.
 */
import { GoogleGenerativeAI } from '@google/generative-ai'
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  Timestamp,
  arrayUnion,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import * as watcherAgent from './watcherAgent'
import * as calculatorAgent from './calculatorAgent'
import * as filerAgent from './filerAgent'
import * as guardianAgent from './guardianAgent'
import * as narratorAgent from './narratorAgent'

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '')
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-1.5-flash'

function getCurrentPeriod() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const y = d.getFullYear()
  return `${m}${y}`
}

// ============================================
// 1. WORKFLOW REGISTRY
// ============================================

export const WORKFLOWS = {
  invoice_processing: {
    name: 'Invoice Processing',
    trigger: 'invoice_uploaded',
    steps: [
      {
        agent: 'watcher',
        action: 'saveNormalizedInvoice',
        input_from: 'trigger_data',
        success_next: 'narrator_notify',
        failure_action: 'retry_3_times',
      },
      {
        agent: 'narrator',
        action: 'notify',
        input_from: 'all_previous_outputs',
        event: 'invoice_processed',
        success_next: 'end',
        failure_action: 'retry_once',
      },
    ],
    estimated_duration_ms: 10000,
    priority: 'high',
  },

  month_end_closing: {
    name: 'Month-End Closing',
    trigger: 'last_day_of_month',
    steps: [
      {
        agent: 'calculator',
        action: 'getMonthlySummaryForFiling',
        input_from: 'business_id_and_period',
        success_next: 'guardian_recalculate',
        failure_action: 'alert_master',
      },
      {
        agent: 'guardian',
        action: 'recalculateComplianceScore',
        input_from: 'business_id',
        success_next: 'narrator_summary',
        failure_action: 'log',
      },
      {
        agent: 'narrator',
        action: 'notify',
        event: 'month_end_summary',
        input_from: 'all_previous_outputs',
        success_next: 'end',
        failure_action: 'log',
      },
    ],
    estimated_duration_ms: 15000,
    priority: 'critical',
  },

  filing_pipeline: {
    name: 'GST Return Filing',
    trigger: 'user_initiated_filing',
    steps: [
      {
        agent: 'calculator',
        action: 'getMonthlySummaryForFiling',
        input_from: 'business_id_and_period',
        success_next: 'filer_preflight',
        failure_action: 'abort_with_reason',
      },
      {
        agent: 'filer',
        action: 'preFlightChecks',
        input_from: 'business_id_and_period',
        success_next: 'end',
        failure_action: 'abort_with_reason',
      },
    ],
    human_in_loop_checkpoints: ['step_2_after_preflight'],
    estimated_duration_ms: 60000,
    priority: 'critical',
  },

  notice_handling: {
    name: 'GST Notice Response',
    trigger: 'notice_detected',
    steps: [
      {
        agent: 'guardian',
        action: 'processNotice',
        input_from: 'trigger_data',
        success_next: 'narrator_alert',
        failure_action: 'alert_master',
      },
      {
        agent: 'narrator',
        action: 'sendAlert',
        event: 'notice_received',
        input_from: 'all_previous_outputs',
        success_next: 'end',
        failure_action: 'retry_once',
      },
    ],
    estimated_duration_ms: 60000,
    priority: 'urgent',
  },

  daily_compliance_check: {
    name: 'Daily Compliance Monitoring',
    trigger: 'cron_daily_9am',
    steps: [
      {
        agent: 'guardian',
        action: 'checkPortalForNotices',
        input_from: 'business_id',
        success_next: 'guardian_supplier_check',
        failure_action: 'retry_3_times',
      },
      {
        agent: 'guardian',
        action: 'checkSupplierFilings',
        input_from: 'business_id',
        success_next: 'guardian_recalculate',
        failure_action: 'log_and_continue',
      },
      {
        agent: 'guardian',
        action: 'recalculateComplianceScore',
        input_from: 'business_id',
        success_next: 'end',
        failure_action: 'log',
      },
    ],
    estimated_duration_ms: 120000,
    priority: 'medium',
  },
}

// ============================================
// 2. WORKFLOW EXECUTION ENGINE
// ============================================

export async function executeWorkflow(params) {
  const { workflow_id, business_id, trigger_data = {}, context = {} } = params
  const ctx = { ...context, business_id: business_id || context.business_id }

  const workflow = WORKFLOWS[workflow_id]
  if (!workflow) throw new Error(`Unknown workflow: ${workflow_id}`)

  console.log(`🧠 MASTER PLANNER: Starting workflow "${workflow.name}"`)

  const executionRecord = {
    workflow_id,
    workflow_name: workflow.name,
    business_id: ctx.business_id,
    status: 'running',
    current_step: 0,
    total_steps: workflow.steps.length,
    started_at: Timestamp.now(),
    trigger_data,
    context: ctx,
    step_results: [],
    errors: [],
    estimated_completion: new Date(Date.now() + (workflow.estimated_duration_ms || 60000)).toISOString(),
  }

  const executionRef = await addDoc(collection(db, 'workflow_executions'), executionRecord)
  const executionId = executionRef.id

  let previousOutputs = { trigger_data, business_id: ctx.business_id }
  let stepIndex = 0

  for (const step of workflow.steps) {
    stepIndex++
    console.log(`   Step ${stepIndex}/${workflow.steps.length}: ${step.agent}.${step.action}`)

    await updateDoc(doc(db, 'workflow_executions', executionId), {
      current_step: stepIndex,
      status: 'running',
    })

    const checkpointId = `step_${stepIndex}_after_${step.action}`
    if (workflow.human_in_loop_checkpoints?.includes(checkpointId)) {
      await updateDoc(doc(db, 'workflow_executions', executionId), {
        status: 'awaiting_user',
        awaiting_step: stepIndex,
        awaiting_action: step.action,
      })
      return {
        success: true,
        status: 'awaiting_user',
        execution_id: executionId,
        next_action_required: step.action,
      }
    }

    const stepInput = prepareStepInput(step, previousOutputs, ctx)
    const maxAttempts = getMaxAttempts(step.failure_action)
    let stepResult
    let attempts = 0
    let lastError

    while (attempts < maxAttempts) {
      attempts++
      try {
        stepResult = await executeAgentAction(step.agent, step.action, stepInput, step, ctx)
        previousOutputs[`${step.agent}_${step.action}_output`] = stepResult
        await updateDoc(doc(db, 'workflow_executions', executionId), {
          step_results: arrayUnion({
            step: stepIndex,
            agent: step.agent,
            action: step.action,
            status: 'success',
            result: stepResult,
            completed_at: new Date().toISOString(),
          }),
        })
        break
      } catch (err) {
        lastError = err
        console.warn(`   ❌ Step ${stepIndex} failed (attempt ${attempts}/${maxAttempts}):`, err?.message)
        if (attempts >= maxAttempts) {
          return await handleStepFailure(executionId, stepIndex, step, err, previousOutputs, ctx)
        }
        await new Promise((r) => setTimeout(r, Math.pow(2, attempts) * 500))
      }
    }

    if (step.success_next === 'end') break
  }

  await updateDoc(doc(db, 'workflow_executions', executionId), {
    status: 'completed',
    completed_at: new Date().toISOString(),
  })

  try {
    await learnFromExecution(executionId)
  } catch (_) {}

  console.log(`🎉 MASTER PLANNER: Workflow "${workflow.name}" completed`)
  return {
    success: true,
    execution_id: executionId,
    status: 'completed',
    results: previousOutputs,
  }
}

// ============================================
// 3. AGENT ACTION EXECUTOR
// ============================================

async function executeAgentAction(agentName, actionName, input, step, context) {
  const businessId = context.business_id
  const period = context.period || getCurrentPeriod()

  switch (agentName) {
    case 'watcher': {
      if (actionName === 'saveNormalizedInvoice') {
        const { businessId: bid, normalized, options } = input
        const id = bid || businessId
        if (!id || !normalized) throw new Error('saveNormalizedInvoice requires businessId and normalized')
        return await watcherAgent.saveNormalizedInvoice(id, normalized, options || {})
      }
      break
    }
    case 'calculator': {
      if (actionName === 'getMonthlySummaryForFiling') {
        const bid = input.business_id || businessId
        const p = input.period || period
        return await calculatorAgent.getMonthlySummaryForFiling(bid, p)
      }
      if (actionName === 'generateGSTR3B') {
        return await calculatorAgent.generateGSTR3B(businessId, period)
      }
      if (actionName === 'computeNetTax') {
        return await calculatorAgent.computeNetTax(businessId, period)
      }
      break
    }
    case 'filer': {
      if (actionName === 'preFlightChecks') {
        const bid = input.business_id || businessId
        const p = input.period || period
        return await filerAgent.preFlightChecks(bid, p, 'GSTR-3B')
      }
      break
    }
    case 'guardian': {
      if (actionName === 'processNotice') {
        const bid = input.business_id || businessId
        const noticeData = input.notice ?? input
        return await guardianAgent.processNotice(bid, noticeData)
      }
      if (actionName === 'checkPortalForNotices') {
        return await guardianAgent.checkPortalForNotices(businessId)
      }
      if (actionName === 'checkSupplierFilings') {
        return await guardianAgent.checkSupplierFilings(businessId)
      }
      if (actionName === 'recalculateComplianceScore') {
        return await guardianAgent.recalculateComplianceScore(businessId)
      }
      if (actionName === 'updateComplianceScore') {
        const event = step?.event || input.event || 'workflow_step'
        return await guardianAgent.updateComplianceScore(businessId, { event })
      }
      break
    }
    case 'narrator': {
      const uid = input.user_id || input.business_id || businessId
      if (actionName === 'notify') {
        return await narratorAgent.notify({
          event: step?.event || input.event || 'workflow_update',
          user_id: uid,
          data: input.summary ?? input.result ?? input,
          priority: 'normal',
          channels: ['app'],
        })
      }
      if (actionName === 'sendAlert') {
        return await narratorAgent.sendAlert(uid, {
          event: step?.event || input.event || 'alert',
          ...input,
        })
      }
      if (actionName === 'celebrate') {
        return await narratorAgent.celebrate(uid, input.data ?? input)
      }
      break
    }
  }

  throw new Error(`Unknown or unsupported action: ${agentName}.${actionName}`)
}

// ============================================
// 4. INPUT PREPARATION
// ============================================

function prepareStepInput(step, previousOutputs, context) {
  const business_id = context.business_id
  const period = context.period || getCurrentPeriod()

  switch (step.input_from) {
    case 'trigger_data':
      return { ...previousOutputs.trigger_data, business_id }
    case 'all_previous_outputs':
      return {
        business_id,
        user_id: business_id,
        summary: previousOutputs,
        result: Object.values(previousOutputs).filter((v) => v && typeof v === 'object' && !Array.isArray(v))[0],
        ...previousOutputs,
      }
    case 'business_id':
      return { business_id }
    case 'business_id_and_period':
      return { business_id, period }
    default:
      return previousOutputs[step.input_from] || { business_id }
  }
}

// ============================================
// 5. FAILURE HANDLING
// ============================================

function getMaxAttempts(failureAction) {
  if (!failureAction) return 1
  if (failureAction.includes('retry_3_times')) return 3
  if (failureAction.includes('retry_5_times')) return 5
  if (failureAction.includes('retry_once')) return 2
  return 1
}

async function handleStepFailure(executionId, stepIndex, step, error, previousOutputs, context) {
  const businessId = context.business_id

  await updateDoc(doc(db, 'workflow_executions', executionId), {
    status: 'failed',
    failed_at: new Date().toISOString(),
    failed_step: stepIndex,
    error: error?.message || String(error),
    errors: arrayUnion({
      step: stepIndex,
      error: error?.message || String(error),
      timestamp: new Date().toISOString(),
    }),
  })

  if (step.failure_action?.includes('alert_user') && businessId) {
    try {
      await narratorAgent.sendAlert(businessId, {
        event: 'workflow_failed',
        workflow: step.agent + '.' + step.action,
        error: error?.message,
      })
    } catch (_) {}
  }

  if (step.failure_action?.includes('abort_with_reason') && businessId) {
    try {
      await narratorAgent.notify({
        event: 'workflow_aborted',
        user_id: businessId,
        data: { reason: error?.message, step: step.action },
        priority: 'high',
        channels: ['app'],
      })
    } catch (_) {}
  }

  return {
    success: false,
    status: 'failed',
    execution_id: executionId,
    error: error?.message,
    failed_step: stepIndex,
  }
}

// ============================================
// 6. WORKFLOW RESUME
// ============================================

export async function resumeWorkflow(executionId, userInput) {
  const executionSnap = await getDoc(doc(db, 'workflow_executions', executionId))
  if (!executionSnap.exists()) throw new Error(`Execution ${executionId} not found`)
  const execution = executionSnap.data()
  if (execution.status !== 'awaiting_user') {
    throw new Error(`Workflow ${executionId} is not awaiting user input`)
  }

  const workflow = WORKFLOWS[execution.workflow_id]
  if (!workflow) throw new Error(`Unknown workflow: ${execution.workflow_id}`)

  await updateDoc(doc(db, 'workflow_executions', executionId), {
    status: 'running',
    user_input: userInput,
  })

  let previousOutputs = {
    trigger_data: execution.trigger_data,
    business_id: execution.business_id,
    user_input: userInput,
  }
 ;(execution.step_results || []).forEach((r) => {
    previousOutputs[`${r.agent}_${r.action}_output`] = r.result
  })

  const remainingSteps = workflow.steps.slice(execution.awaiting_step)
  const ctx = { ...execution.context, business_id: execution.business_id }
  let stepIndex = execution.awaiting_step

  for (const step of remainingSteps) {
    stepIndex++
    const stepInput = prepareStepInput(step, previousOutputs, ctx)
    try {
      const stepResult = await executeAgentAction(step.agent, step.action, stepInput, step, ctx)
      previousOutputs[`${step.agent}_${step.action}_output`] = stepResult
      await updateDoc(doc(db, 'workflow_executions', executionId), {
        current_step: stepIndex,
        step_results: arrayUnion({
          step: stepIndex,
          agent: step.agent,
          action: step.action,
          status: 'success',
          result: stepResult,
          completed_at: new Date().toISOString(),
        }),
      })
    } catch (err) {
      return await handleStepFailure(executionId, stepIndex, step, err, previousOutputs, ctx)
    }
    if (step.success_next === 'end') break
  }

  await updateDoc(doc(db, 'workflow_executions', executionId), {
    status: 'completed',
    completed_at: new Date().toISOString(),
  })

  return { success: true, execution_id: executionId, status: 'completed', results: previousOutputs }
}

// ============================================
// 7. AUTONOMOUS DECISION (Gemini)
// ============================================

export async function makeDecision(params) {
  const { situation, options, context } = params
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim()
  if (!apiKey) {
    return {
      decision: 1,
      reasoning: 'No API key; defaulting to first option.',
      confidence: 50,
      should_notify_user: true,
      urgency: 'medium',
    }
  }

  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })
    const prompt = `
You are the Master Planner AI for TaxSetu (GST compliance).

SITUATION: ${situation}

OPTIONS:
${(options || []).map((opt, i) => `${i + 1}. ${opt.action || opt.description} - ${opt.description || ''}`).join('\n')}

CONTEXT: Business ${context?.business_name || context?.business_id || 'N/A'}, Compliance: ${context?.compliance_score ?? 'N/A'}/100.

Return ONLY valid JSON: { "decision": 1, "reasoning": "string", "confidence": 80, "should_notify_user": true, "urgency": "medium" }
`
    const result = await model.generateContent(prompt)
    const text = (result.response?.text?.() || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const decision = JSON.parse(text)
    if (context?.business_id) {
      try {
        await addDoc(collection(db, 'autonomous_decisions'), {
          business_id: context.business_id,
          situation,
          options,
          decision,
          timestamp: new Date().toISOString(),
        })
      } catch (_) {}
    }
    return decision
  } catch (err) {
    console.warn('makeDecision failed:', err?.message)
    return {
      decision: 1,
      reasoning: 'Fallback: first option.',
      confidence: 50,
      should_notify_user: true,
      urgency: 'medium',
    }
  }
}

// ============================================
// 8. LEARNING
// ============================================

async function learnFromExecution(executionId) {
  try {
    const snap = await getDoc(doc(db, 'workflow_executions', executionId))
    const execution = snap.data()
    if (!execution?.completed_at || !execution?.started_at) return

    const startTime = new Date(execution.started_at?.toDate?.() || execution.started_at)
    const endTime = new Date(execution.completed_at?.toDate?.() || execution.completed_at)
    const actualDuration = endTime - startTime
    const workflow = WORKFLOWS[execution.workflow_id]
    if (!workflow?.estimated_duration_ms) return

    const metricsRef = doc(db, 'workflow_metrics', execution.workflow_id)
    const metricsSnap = await getDoc(metricsRef)

    if (metricsSnap.exists()) {
      const m = metricsSnap.data()
      const n = (m.execution_count || 0) + 1
      const avg = ((m.avg_duration || 0) * (m.execution_count || 0) + actualDuration) / n
      const successRate = ((m.success_rate || 0) * (m.execution_count || 0) + (execution.status === 'completed' ? 100 : 0)) / n
      await updateDoc(metricsRef, {
        execution_count: n,
        avg_duration: avg,
        last_execution: execution.completed_at,
        success_rate: successRate,
      })
    } else {
      await setDoc(metricsRef, {
        workflow_id: execution.workflow_id,
        execution_count: 1,
        avg_duration: actualDuration,
        last_execution: execution.completed_at,
        success_rate: execution.status === 'completed' ? 100 : 0,
      })
    }
  } catch (_) {}
}

// ============================================
// 9. TRIGGER HANDLERS
// ============================================

export async function onInvoiceUploaded(businessId, invoiceData) {
  const normalized = invoiceData?.normalized || invoiceData?.invoice || invoiceData
  return await executeWorkflow({
    workflow_id: 'invoice_processing',
    business_id: businessId,
    trigger_data: { businessId, normalized },
    context: { business_id: businessId },
  })
}

export async function onMonthEnd(businessId) {
  const period = getCurrentPeriod()
  return await executeWorkflow({
    workflow_id: 'month_end_closing',
    business_id: businessId,
    trigger_data: { period },
    context: { business_id: businessId, period },
  })
}

export async function onFilingInitiated(businessId, returnType, period) {
  const p = period || getCurrentPeriod()
  return await executeWorkflow({
    workflow_id: 'filing_pipeline',
    business_id: businessId,
    trigger_data: { return_type: returnType || 'GSTR-3B', period: p },
    context: { business_id: businessId, return_type: returnType, period: p },
  })
}

export async function onThresholdCrossed(businessId, turnoverData) {
  return await executeWorkflow({
    workflow_id: 'invoice_processing',
    business_id: businessId,
    trigger_data: turnoverData,
    context: { business_id: businessId },
  })
}

export async function onNoticeDetected(businessId, noticeData) {
  return await executeWorkflow({
    workflow_id: 'notice_handling',
    business_id: businessId,
    trigger_data: { business_id: businessId, notice: noticeData },
    context: { business_id: businessId },
  })
}

export async function runDailyComplianceCheck(businessId) {
  return await executeWorkflow({
    workflow_id: 'daily_compliance_check',
    business_id: businessId,
    trigger_data: {},
    context: { business_id: businessId },
  })
}

// ============================================
// 10. OBSERVABILITY
// ============================================

export async function getWorkflowStatus(executionId) {
  const snap = await getDoc(doc(db, 'workflow_executions', executionId))
  if (!snap.exists()) return { found: false }
  const execution = snap.data()
  const workflow = WORKFLOWS[execution.workflow_id]
  const total = execution.total_steps || 1
  const current = execution.current_step || 0
  return {
    found: true,
    execution_id: executionId,
    workflow_name: workflow?.name || execution.workflow_name,
    status: execution.status,
    progress: {
      current_step: current,
      total_steps: total,
      percentage: Math.round((current / total) * 100),
    },
    started_at: execution.started_at,
    estimated_completion: execution.estimated_completion,
    current_action: execution.step_results?.[execution.step_results.length - 1]?.action,
    errors: execution.errors || [],
  }
}

export async function getActiveWorkflows(businessId) {
  if (!businessId) return []
  try {
    const q = query(
      collection(db, 'workflow_executions'),
      where('business_id', '==', businessId)
    )
    const snapshot = await getDocs(q)
    const list = snapshot.docs
      .map((d) => ({ execution_id: d.id, ...d.data() }))
      .filter((wf) => wf.status === 'running' || wf.status === 'awaiting_user')
      .sort((a, b) => {
        const ta = a.started_at?.toDate?.()?.getTime() ?? new Date(a.started_at || 0).getTime()
        const tb = b.started_at?.toDate?.()?.getTime() ?? new Date(b.started_at || 0).getTime()
        return tb - ta
      })
    return list
  } catch (_) {
    return []
  }
}

export default {
  executeWorkflow,
  resumeWorkflow,
  makeDecision,
  onInvoiceUploaded,
  onMonthEnd,
  onFilingInitiated,
  onThresholdCrossed,
  onNoticeDetected,
  runDailyComplianceCheck,
  getWorkflowStatus,
  getActiveWorkflows,
  WORKFLOWS,
}
