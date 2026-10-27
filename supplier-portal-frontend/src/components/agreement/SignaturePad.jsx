import { useCallback, useEffect, useRef, useState } from 'react'
import { Eraser, Undo2 } from 'lucide-react'
import Button from '../common/Button'

const DEFAULT_WIDTH = 600
const HEIGHT = 170
const SCALE = 2 // backing resolution, so the saved PNG stays sharp
const LINE_WIDTH = 2.5
const INK = '#000000'

function paint(canvas, strokes, WIDTH) {
  const ctx = canvas.getContext('2d')
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  ctx.strokeStyle = INK
  ctx.fillStyle = INK
  ctx.lineWidth = LINE_WIDTH
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  strokes.forEach((points) => {
    if (points.length === 1) {
      ctx.beginPath()
      ctx.arc(points[0].x, points[0].y, LINE_WIDTH / 2, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    // Smooth the stroke with quadratic curves through the midpoints of consecutive samples.
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length - 1; i += 1) {
      const midX = (points[i].x + points[i + 1].x) / 2
      const midY = (points[i].y + points[i + 1].y) / 2
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY)
    }
    const last = points[points.length - 1]
    ctx.lineTo(last.x, last.y)
    ctx.stroke()
  })
}

// A drawing area for a signature (mouse, touch or stylus). Reports a transparent PNG data URL, or null while empty.
export default function SignaturePad({ onChange }) {
  const canvasRef = useRef(null)
  const strokes = useRef([])
  const drawing = useRef(false)
  const onChangeRef = useRef(onChange)
  const wrapRef = useRef(null)
  const widthRef = useRef(DEFAULT_WIDTH)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [count, setCount] = useState(0)

  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  // The drawing area is as wide as its box (strokes are kept in on-screen pixels), so what is drawn is what is saved.
  useEffect(() => {
    const box = wrapRef.current
    if (!box || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width)
      if (next > 50 && next !== widthRef.current) {
        widthRef.current = next
        setWidth(next)
      }
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [])
  // A resized canvas is blank until it is painted again.
  useEffect(() => {
    if (canvasRef.current) {
      paint(canvasRef.current, strokes.current, widthRef.current)
      if (strokes.current.length) onChangeRef.current?.(canvasRef.current.toDataURL('image/png'))
    }
  }, [width])

  const commit = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    paint(canvas, strokes.current, widthRef.current)
    setCount(strokes.current.length)
    onChangeRef.current?.(strokes.current.length ? canvas.toDataURL('image/png') : null)
  }, [])

  const pointFrom = (event) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: ((event.clientX - rect.left) / rect.width) * widthRef.current, y: ((event.clientY - rect.top) / rect.height) * HEIGHT }
  }

  const start = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    canvasRef.current.setPointerCapture?.(event.pointerId)
    drawing.current = true
    strokes.current.push([pointFrom(event)])
    paint(canvasRef.current, strokes.current, widthRef.current)
  }
  const move = (event) => {
    if (!drawing.current) return
    event.preventDefault()
    const current = strokes.current[strokes.current.length - 1]
    // Coalesced events give every sample of a fast stroke, not just the last one per frame.
    const events = event.nativeEvent.getCoalescedEvents?.() || [event.nativeEvent]
    events.forEach((item) => current.push(pointFrom(item)))
    paint(canvasRef.current, strokes.current, widthRef.current)
  }
  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    commit()
  }

  const clear = () => { strokes.current = []; commit() }
  const undo = () => { strokes.current = strokes.current.slice(0, -1); commit() }

  return (
    <div>
      <div ref={wrapRef} className="relative overflow-hidden rounded-lg border border-dashed border-[#a7b4c8] bg-white">
        <canvas
          ref={canvasRef}
          width={width * SCALE}
          height={HEIGHT * SCALE}
          className="block w-full cursor-crosshair"
          style={{ touchAction: 'none', height: HEIGHT }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
          aria-label="Draw your signature here"
        />
        {count === 0 && <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm font-medium text-slate-400">Sign here with your mouse, finger or stylus</p>}
        <span className="pointer-events-none absolute inset-x-6 bottom-10 border-b border-slate-200" aria-hidden="true" />
      </div>
      <div className="mt-1.5 flex justify-end gap-1">
        <Button variant="ghost" className="min-h-7! px-2! py-0.5! text-xs!" onClick={undo} disabled={count === 0}><Undo2 size={14} /> Undo</Button>
        <Button variant="ghost" className="min-h-7! px-2! py-0.5! text-xs!" onClick={clear} disabled={count === 0}><Eraser size={14} /> Clear</Button>
      </div>
    </div>
  )
}
