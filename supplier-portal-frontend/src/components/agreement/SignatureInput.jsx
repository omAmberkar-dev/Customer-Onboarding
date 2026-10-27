import { useEffect, useRef, useState } from 'react'
import { PenLine, Trash2, Type, Upload } from 'lucide-react'
import '@fontsource/great-vibes'
import '@fontsource/allura'
import '@fontsource/dancing-script/700.css'
import '@fontsource/sacramento'
import Button from '../common/Button'
import SignaturePad from './SignaturePad'

const MODES = [['draw', 'Draw', PenLine], ['type', 'Type', Type], ['upload', 'Upload', Upload]]
const MAX_UPLOAD_BYTES = 400 * 1024
// The typed-signature styles; every font is bundled (no CDN) and loaded before the name is drawn.
const FONTS = [
  { key: 'great-vibes', label: 'Great Vibes', family: 'Great Vibes', weight: 400 },
  { key: 'allura', label: 'Allura', family: 'Allura', weight: 400 },
  { key: 'dancing-script', label: 'Dancing Script', family: 'Dancing Script', weight: 700 },
  { key: 'sacramento', label: 'Sacramento', family: 'Sacramento', weight: 400 },
]

// Renders the typed name in the script font to a transparent PNG.
async function renderTypedSignature(text, { family, weight }) {
  try { await document.fonts.load(`${weight} 80px "${family}"`, text) } catch { /* the canvas falls back to cursive */ }
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 400
  const ctx = canvas.getContext('2d')
  let size = 190
  const font = (px) => `${weight} ${px}px "${family}", cursive`
  ctx.font = font(size)
  while (ctx.measureText(text).width > canvas.width - 80 && size > 40) {
    size -= 6
    ctx.font = font(size)
  }
  ctx.fillStyle = '#000000'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)
  return canvas.toDataURL('image/png')
}

// Draw, type or upload a signature. Reports { method, dataUrl } for the chosen mode, or null while that mode is empty.
export default function SignatureInput({ defaultText = '', onChange }) {
  const [mode, setMode] = useState('draw')
  const [drawn, setDrawn] = useState(null)
  const [typedText, setTypedText] = useState('')
  const [fontKey, setFontKey] = useState(FONTS[0].key)
  const [typed, setTyped] = useState(null)
  const [uploaded, setUploaded] = useState(null)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  const text = (typedText || defaultText).trim()
  useEffect(() => {
    let ignore = false
    if (!text) { setTyped(null); return undefined }
    const font = FONTS.find((item) => item.key === fontKey)
    renderTypedSignature(text, font).then((url) => { if (!ignore) setTyped(url) })
    return () => { ignore = true }
  }, [text, fontKey])

  const current = { draw: drawn, type: typed, upload: uploaded }[mode]
  useEffect(() => { onChangeRef.current?.(current ? { method: mode, dataUrl: current } : null) }, [mode, current])

  const pickFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploadError('')
    if (!['image/png', 'image/jpeg'].includes(file.type)) { setUploadError('Please choose a PNG or JPEG image.'); return }
    if (file.size > MAX_UPLOAD_BYTES) { setUploadError('The image is larger than 400 KB. Please choose a smaller one.'); return }
    const reader = new FileReader()
    reader.onload = () => setUploaded(String(reader.result))
    reader.onerror = () => setUploadError('Unable to read that file. Please try another.')
    reader.readAsDataURL(file)
  }

  return (
    <div aria-label="Your signature">
      <div className="inline-flex shrink-0 gap-0.5 rounded-lg bg-[#f1f4f8] p-1" role="tablist" aria-label="How to sign">
        {MODES.map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-md px-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0046dc]/40 ${mode === value ? 'bg-white text-[#052e86] shadow-[0_1px_2px_rgba(16,42,76,0.15)]' : 'text-[#5f5f5f] hover:text-[#000000]'}`}
            style={{ fontSize: '0.75rem', lineHeight: '1rem', fontWeight: 600 }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {/* The pad stays mounted while another mode is open, so the drawing is not lost by switching. */}
        <div className={mode === 'draw' ? '' : 'hidden'}><SignaturePad onChange={setDrawn} /></div>

        {mode === 'type' && (
          <div>
            <label htmlFor="typed-signature" className="mb-1 block text-[11px] font-bold uppercase tracking-[0.04em] text-navy-900">Type your signature</label>
            <input id="typed-signature" className="app-field min-h-9! h-9 py-1!" value={typedText} placeholder={defaultText || 'Your full name'} maxLength={60} onChange={(event) => setTypedText(event.target.value)} />
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Signature style">
              {FONTS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="radio"
                  aria-checked={fontKey === item.key}
                  onClick={() => setFontKey(item.key)}
                  className={`flex h-16 flex-col items-center justify-center overflow-hidden rounded-lg border px-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0046dc]/40 ${fontKey === item.key ? 'border-[#0046dc] bg-[#eef2fb] ring-1 ring-[#0046dc]' : 'border-[#d8e0e9] bg-white hover:border-[#a7b4c8]'}`}
                >
                  <span className="max-w-full truncate text-[22px] leading-8 text-[#000000]" style={{ fontFamily: `"${item.family}", cursive`, fontWeight: item.weight }}>{text || 'Your name'}</span>
                  <span className="text-[10px] font-semibold text-slate-500">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'upload' && (
          <div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={pickFile} aria-label="Upload a signature image" />
            <div className="relative grid h-[110px] place-items-center overflow-hidden rounded-lg border border-dashed border-[#a7b4c8] bg-white px-3">
              {uploaded
                ? <img src={uploaded} alt="Your uploaded signature" className="max-h-[96px] max-w-full object-contain" />
                : <p className="text-sm font-medium text-slate-400">PNG or JPEG, up to 400 KB</p>}
              <div className="absolute bottom-1.5 right-1.5 flex gap-1.5">
                <Button variant="secondary" className="min-h-8! px-3! py-1! text-xs!" onClick={() => fileRef.current?.click()}><Upload size={14} /> {uploaded ? 'Choose another' : 'Choose image'}</Button>
                {uploaded && <Button variant="secondary" className="min-h-8! px-3! py-1! text-xs!" onClick={() => { setUploaded(null); setUploadError('') }}><Trash2 size={14} /> Remove</Button>}
              </div>
            </div>
            {uploadError && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{uploadError}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
