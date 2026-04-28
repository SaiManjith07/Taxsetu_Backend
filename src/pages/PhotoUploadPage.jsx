import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { useAuth } from '../contexts/AuthContext'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../lib/firebase'
import { extractInvoiceFromImage } from '../services/geminiService'
import { normalizeFromPhoto, saveNormalizedInvoice } from '../services/watcherAgent'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import Button from '../components/ui/Button'
import ImagePreview from '../components/upload/ImagePreview'
import OCRResultsCard from '../components/upload/OCRResultsCard'
import VerificationInterface from '../components/upload/VerificationInterface'
import { Upload, Loader2, Clock } from 'lucide-react'

const MAX_SIZE = 5 * 1024 * 1024
const ACCEPT = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/heic': ['.heic'] }

export default function PhotoUploadPage() {
  const { user } = useAuth()
  const businessIdVal = user?.uid
  const [file, setFile] = useState(null)
  const [ocrData, setOcrData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retryCountdown, setRetryCountdown] = useState(0)
  const [step, setStep] = useState('upload') // upload | ocr | verify | done
  const [invoiceType, setInvoiceType] = useState('purchase') // 'purchase' | 'sale'

  useEffect(() => {
    if (retryCountdown <= 0) return
    const t = setInterval(() => setRetryCountdown((c) => (c <= 1 ? 0 : c - 1)), 1000)
    return () => clearInterval(t)
  }, [retryCountdown])

  const onDrop = useCallback((acceptedFiles) => {
    setError('')
    setRetryCountdown(0)
    setOcrData(null)
    setStep('upload')
    setInvoiceType('purchase')
    if (acceptedFiles.length) setFile(acceptedFiles[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: MAX_SIZE,
    accept: ACCEPT,
    maxFiles: 1,
    onDropRejected: (r) => setError(r[0]?.errors?.[0]?.message || 'File rejected'),
  })

  const runOCR = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const base64 = reader.result
          const data = await extractInvoiceFromImage(base64)
          setOcrData(data)
          setStep('verify')
        } catch (e) {
          setError(e.message || 'OCR failed')
          if (e.retryAfterSeconds) setRetryCountdown(e.retryAfterSeconds)
        } finally {
          setLoading(false)
        }
      }
      reader.readAsDataURL(file)
    } catch (e) {
      setError(e.message || 'OCR failed')
      setLoading(false)
    }
  }

  const handleConfirm = async (verifiedData) => {
    setLoading(true)
    setError('')
    try {
      let imageUrl = ''
      const isDemo = businessIdVal === 'demo'
      const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      const isDev = import.meta.env?.DEV === true
      if (file && businessIdVal && !isDemo && !isLocalhost && !isDev) {
        try {
          const path = `businesses/${businessIdVal}/invoices/${Date.now()}.jpg`
          const storageRef = ref(storage, path)
          await uploadBytes(storageRef, file)
          imageUrl = await getDownloadURL(storageRef)
        } catch (storageErr) {
          console.warn('Image upload skipped:', storageErr?.message || storageErr)
        }
      }
      if (businessIdVal && !isDemo) {
        const normalized = normalizeFromPhoto(verifiedData, { imageUrl, ocrData, transaction_type: invoiceType })
        await saveNormalizedInvoice(businessIdVal, normalized, { confidence_score: 85 })
      } else if (isDemo) {
        // Demo: no Firestore write
      }
      setStep('done')
      setFile(null)
      setOcrData(null)
    } catch (e) {
      setError(e.message || 'Save failed')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setFile(null)
    setOcrData(null)
    setStep('upload')
    setError('')
    setRetryCountdown(0)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Photo upload (OCR)</h1>
        <p className="text-text-secondary mt-1">Upload an invoice photo; AI will extract data for verification.</p>
      </div>

      <Card>
        <CardHeader title="Upload invoice" subtitle="JPEG, PNG or HEIC, max 5MB" />
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-text-secondary">This image is for:</span>
            <div className="inline-flex rounded-lg overflow-hidden border border-white/15">
              <button
                type="button"
                onClick={() => setInvoiceType('purchase')}
                className={`px-3 py-1 text-sm font-medium ${
                  invoiceType === 'purchase' ? 'bg-primary text-white' : 'bg-transparent text-text-secondary'
                }`}
              >
                Purchase (ITC)
              </button>
              <button
                type="button"
                onClick={() => setInvoiceType('sale')}
                className={`px-3 py-1 text-sm font-medium border-l border-white/15 ${
                  invoiceType === 'sale' ? 'bg-primary text-white' : 'bg-transparent text-text-secondary'
                }`}
              >
                Sale (Outward)
              </button>
            </div>
          </div>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragActive ? 'border-primary bg-primary/10' : 'border-white/20 hover:border-white/40'
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="w-12 h-12 mx-auto text-text-secondary mb-3" />
            <p className="text-text-primary">Drop an image here or click to browse</p>
          </div>
          {file && (
            <div className="mt-4 flex items-center gap-4">
              <ImagePreview file={file} onRemove={reset} />
              <div>
                <p className="text-sm text-text-primary font-medium">{file.name}</p>
                {step === 'upload' && (
                  <Button
                    className="mt-2"
                    onClick={runOCR}
                    disabled={loading || retryCountdown > 0}
                  >
                    {loading ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Extracting... </>
                    ) : retryCountdown > 0 ? (
                      <><Clock className="w-4 h-4 mr-2" /> Try again in {retryCountdown}s</>
                    ) : (
                      'Extract with AI'
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="flex flex-wrap items-center gap-2 text-danger">
          <p>{error}</p>
          {retryCountdown > 0 && (
            <span className="text-text-secondary text-sm">(Retry available in {retryCountdown}s)</span>
          )}
        </div>
      )}

      {step === 'verify' && ocrData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <OCRResultsCard data={ocrData} />
          <VerificationInterface
            initialData={{
              invoice_number: ocrData.invoice_number,
              invoice_date: ocrData.invoice_date,
              supplier_name: ocrData.supplier_name,
              supplier_gstin: ocrData.supplier_gstin,
              taxable_amount: ocrData.taxable_amount,
              gst_rate: ocrData.gst_rate,
              gst_amount: ocrData.gst_amount,
              total_amount: ocrData.total_amount,
            }}
            onConfirm={handleConfirm}
            onReject={reset}
          />
        </div>
      )}

      {step === 'done' && (
        <Card className="border-success/50">
          <CardContent className="py-8 text-center">
            <p className="text-success text-lg font-medium">Invoice saved. Watcher agent will process it.</p>
            <Button className="mt-4" onClick={reset}>Upload another</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
