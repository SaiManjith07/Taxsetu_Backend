export default function ImagePreview({ file, onRemove }) {
  const url = file ? URL.createObjectURL(file) : null
  return (
    <div className="relative rounded-xl overflow-hidden bg-surface border border-white/10 aspect-video max-h-64">
      {url ? (
        <>
          <img src={url} alt="Upload preview" className="w-full h-full object-contain" />
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-danger/90 text-white hover:bg-danger"
            >
              ✕
            </button>
          )}
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-text-secondary">
          No image selected
        </div>
      )}
    </div>
  )
}
