import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Card, CardHeader, CardContent } from '../ui/Card'
import Button from '../ui/Button'
import Input from '../ui/Input'
import { PenLine, BookOpen } from 'lucide-react'

const today = new Date().toISOString().slice(0, 10)

export default function ManualLedgerEntry({ onSave }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      entry_date: today,
      transaction_type: 'purchase',
      party_name: '',
      party_gstin: '',
      amount: '',
      gst_included: true,
      description: '',
    },
  })

  const onSubmit = (data) => {
    const entry = {
      id: Date.now(),
      date: data.entry_date,
      transaction_type: data.transaction_type,
      party_name: data.party_name.trim(),
      party_gstin: (data.party_gstin || '').trim() || null,
      amount: Number(data.amount) || 0,
      gst_included: data.gst_included === true || data.gst_included === 'true',
      description: data.description?.trim() || '',
      created_at: new Date().toISOString(),
      source: 'manual',
    }
    onSave?.(entry)
    reset({
      entry_date: today,
      transaction_type: 'purchase',
      party_name: '',
      party_gstin: '',
      amount: '',
      gst_included: true,
      description: '',
    })
  }

  return (
    <Card className="border-white/20">
      <CardHeader
        title={
          <span className="flex items-center gap-2 text-text-primary">
            <BookOpen className="w-5 h-5 text-primary" />
            Manual entry (ledger)
          </span>
        }
        subtitle="Enter transaction like your ledger book – date, particulars, amount."
      />
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Date"
              type="date"
              {...register('entry_date', { required: 'Date required' })}
              error={errors.entry_date?.message}
            />
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Type</label>
              <select
                className="w-full px-3 py-2 rounded-lg bg-background border border-white/20 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                {...register('transaction_type')}
              >
                <option value="purchase">Purchase</option>
                <option value="sale">Sale</option>
              </select>
            </div>
          </div>

          <Input
            label="Particulars (Party name)"
            placeholder="e.g. ABC Traders, Ramesh Kumar"
            {...register('party_name', { required: 'Party name required' })}
            error={errors.party_name?.message}
          />

          <Input
            label="Party GSTIN (optional)"
            placeholder="15 characters, e.g. 29ABCDE1234F1Z5"
            maxLength={15}
            {...register('party_gstin')}
          />

          <Input
            label="Amount (₹)"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            {...register('amount', {
              required: 'Amount required',
              min: { value: 0.01, message: 'Enter valid amount' },
            })}
            error={errors.amount?.message}
          />

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-white/30 bg-background text-primary focus:ring-primary"
                {...register('gst_included')}
              />
              <span className="text-sm text-text-secondary">GST included in amount</span>
            </label>
          </div>

          <Input
            label="Narration (optional)"
            placeholder="e.g. Cotton fabric, 50 metres"
            {...register('description')}
          />

          <Button type="submit" className="w-full sm:w-auto">
            <PenLine className="w-4 h-4 mr-2" />
            Add to ledger
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
