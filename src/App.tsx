import { useState, useRef, useEffect, useCallback } from "react"
import { adjustImageSize, pixelateImage, flattenAlpha, floydSteinbergDither, quantizeToNearestColor, rgbToHex } from "@/lib/functions"
import { COLOR_NAME_MAP } from "@/lib/palette"
import imageLogo from "@/asset/image.svg"

function ImagePreview({
  processedCanvas,
  currentBlockSize,
}: {
  processedCanvas: HTMLCanvasElement
  currentBlockSize: number
}) {
  const [zoomLevel, setZoomLevel] = useState(1),
    [colorInfo, setColorInfo] = useState({ show: false, x: 0, y: 0, text: '' }),
    [isDragging, setIsDragging] = useState(false),
    [dragStart, setDragStart] = useState({ x: 0, y: 0 }),
    [canvasPosition, setCanvasPosition] = useState({ x: 0, y: 0 }),
    [initialPosition, setInitialPosition] = useState({ x: 0, y: 0 })

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  /** グリッド描画 */
  function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, blockSize: number) {
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.5

    const pixelSize = blockSize * zoomLevel

    if (pixelSize < 4) return // グリッドが細かすぎる場合は描画しない

    // 縦線
    for (let x = 0; x <= width; x += pixelSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }

    // 横線
    for (let y = 0; y <= height; y += pixelSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    ctx.globalAlpha = 1
  }

  /** キャンバスを描画 */
  const drawCanvas = useCallback(() => {
    if (!processedCanvas || !canvasRef.current) return

    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return

    const sourceCanvas = processedCanvas

    const displayWidth = sourceCanvas.width * zoomLevel
    const displayHeight = sourceCanvas.height * zoomLevel

    canvasRef.current.width = displayWidth
    canvasRef.current.height = displayHeight

    ctx.imageSmoothingEnabled = false
    ctx.drawImage(sourceCanvas, 0, 0, displayWidth, displayHeight)

    if (zoomLevel >= 2) {
      drawGrid(ctx, displayWidth, displayHeight, currentBlockSize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedCanvas, zoomLevel, currentBlockSize])

  /** カラー情報取得 */
  function getPixelColor(x: number, y: number) {
    if (!processedCanvas) return null

    const canvas = processedCanvas
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // 座標をオリジナルサイズに変換
    const originalX = Math.floor(x / zoomLevel)
    const originalY = Math.floor(y / zoomLevel)

    if (originalX < 0 || originalX >= canvas.width || originalY < 0 || originalY >= canvas.height) {
      return null
    }

    const imageData = ctx.getImageData(originalX, originalY, 1, 1)
    const [r, g, b] = imageData.data

    return { color: rgbToHex(r, g, b), originalX, originalY }
  }

  /** ズームレベル変更時の処理 */
  function handleZoomChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newZoomLevel = parseFloat(e.target.value)
    setZoomLevel(newZoomLevel)

    // ズーム変更時に移動量を再計算・制限する
    if (processedCanvas && containerRef.current) {
      const container = containerRef.current
      const newCanvasWidth = processedCanvas.width * newZoomLevel
      const newCanvasHeight = processedCanvas.height * newZoomLevel
      const containerWidth = container.clientWidth
      const containerHeight = container.clientHeight

      let newX = canvasPosition.x
      let newY = canvasPosition.y

      // X軸
      if (newCanvasWidth > containerWidth) {
        const minX = containerWidth - newCanvasWidth
        newX = Math.max(minX, Math.min(newX, 0))
      } else {
        newX = 0
      }

      // Y軸
      if (newCanvasHeight > containerHeight) {
        const minY = containerHeight - newCanvasHeight
        newY = Math.max(minY, Math.min(newY, 0))
      } else {
        newY = 0
      }

      setCanvasPosition({ x: newX, y: newY })
      setInitialPosition({ x: newX, y: newY })
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
    if (isDragging && canvasRef.current && containerRef.current) {
      e.preventDefault()

      const container = containerRef.current
      const canvasWidth = canvasRef.current.width
      const canvasHeight = canvasRef.current.height
      const containerWidth = container.clientWidth
      const containerHeight = container.clientHeight

      let newX = e.clientX - dragStart.x
      let newY = e.clientY - dragStart.y

      if (canvasWidth > containerWidth) {
        const minX = containerWidth - canvasWidth
        newX = Math.max(minX, Math.min(newX, 0))
      } else {
        newX = 0
      }

      if (canvasHeight > containerHeight) {
        const minY = containerHeight - canvasHeight
        newY = Math.max(minY, Math.min(newY, 0))
      } else {
        newY = 0
      }

      setCanvasPosition({ x: newX, y: newY })
    } else if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      const pixelInfo = getPixelColor(x, y)
      if (pixelInfo) {
        const colorName = COLOR_NAME_MAP[pixelInfo.color.toLowerCase()] || 'Unknown Color'
        setColorInfo({
          show: true,
          x: e.pageX,
          y: e.pageY,
          text: `(${Math.floor(pixelInfo.originalX / currentBlockSize)}, ${Math.floor(pixelInfo.originalY / currentBlockSize)})\n${colorName}\n${pixelInfo.color}`
        })
      } else {
        setColorInfo({ show: false, x: 0, y: 0, text: '' })
      }
    }
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
    e.preventDefault()
    setIsDragging(true)
    setDragStart({
      x: e.clientX - initialPosition.x,
      y: e.clientY - initialPosition.y
    })
  }

  function handleMouseUp() {
    if (isDragging) {
      setIsDragging(false)
      setInitialPosition(canvasPosition)
    }
  }

  function handleMouseLeave() {
    if (isDragging) {
      setIsDragging(false)
      setInitialPosition(canvasPosition)
    }
    setColorInfo({ show: false, x: 0, y: 0, text: '' })
  }

  function downloadImage() {
    if (processedCanvas) {
      const link = document.createElement('a')
      link.download = 'pixelated_image.png'
      link.href = processedCanvas.toDataURL('image/png')
      link.click()
    }
  }

  useEffect(() => {
    drawCanvas()
  }, [drawCanvas])

  // 移動位置とズームの初期化
  useEffect(() => {
    setZoomLevel(1)
    setCanvasPosition({ x: 0, y: 0 })
    setInitialPosition({ x: 0, y: 0 })
  }, [processedCanvas])

  return (
    <div className="preview-area">
      <div className="preview-container">
        <h4>処理後画像 <span>({processedCanvas.width / currentBlockSize}x{processedCanvas.height / currentBlockSize})</span></h4>
        <div className="zoom-controls">
          <label htmlFor="zoomSelect">ズーム:</label>
          <select
            id="zoomSelect"
            value={zoomLevel}
            onChange={handleZoomChange}
          >
            <option value="0.5">50%</option>
            <option value="1">100%</option>
            <option value="2">200%</option>
            <option value="4">400%</option>
            <option value="8">800%</option>
            <option value="10">1000%</option>
          </select>
        </div>
        <div className="canvas-container" ref={containerRef}>
          <canvas
            className="pixel-canvas"
            ref={canvasRef}
            style={{
              cursor: isDragging ? "grabbing" : "crosshair",
              transform: `translate(${canvasPosition.x}px, ${canvasPosition.y}px)`
            }}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          ></canvas>
        </div>
        {(!isDragging && colorInfo.show) && (
          <div
            className="color-info"
            style={{
              display: "block",
              left: colorInfo.x + 5,
              top: colorInfo.y + 5
            }}
          >{colorInfo.text}</div>
        )}
        <button className="download-btn" onClick={downloadImage}>PNG ダウンロード</button>
      </div>
    </div>
  )
}

export default function App() {
  const [blockSize, setBlockSize] = useState(4),
    [ditherChecked, setDitherChecked] = useState(false),
    [noPixelateChecked, setNoPixelateChecked] = useState(false),
    [currentImage, setImageFile] = useState<HTMLImageElement | null>(null),
    [processing, setProcessing] = useState(false),
    [processedCanvas, setProcessedCanvas] = useState<HTMLCanvasElement | null>(null),
    [showPreview, setShowPreview] = useState(false)

  const currentBlockSize = useRef(0)

  /** 画像ファイル選択時の処理 */
  function handleFileSelect(file: File) {
    if (!file.type.startsWith("image/")) {
      alert("画像ファイルを選択してください")
      return
    }

    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        setImageFile(img)
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  /** 画像処理のメイン関数 */
  async function processImage() {
    if (!currentImage) return

    setProcessing(true)

    setTimeout(() => {
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      currentBlockSize.current = ditherChecked || noPixelateChecked ? 1 : blockSize

      // 画像サイズをブロックサイズで割り切れるように調整
      const originalWidth = currentImage.naturalWidth
      const originalHeight = currentImage.naturalHeight
      const adjustedSize = adjustImageSize(originalWidth, originalHeight, currentBlockSize.current)

      canvas.width = adjustedSize.width
      canvas.height = adjustedSize.height

      // 調整されたサイズに画像を描画（中央配置でクロップ）
      const offsetX = (originalWidth - adjustedSize.width) / 2
      const offsetY = (originalHeight - adjustedSize.height) / 2

      ctx.drawImage(currentImage, offsetX, offsetY, adjustedSize.width, adjustedSize.height, 0, 0, adjustedSize.width, adjustedSize.height)

      // ピクセル化（オプション）
      if (!noPixelateChecked) {
        pixelateImage(canvas, currentBlockSize.current)
      }

      // パレット量子化
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      flattenAlpha(imageData)

      let processedImageData: ImageData

      if (ditherChecked) {
        processedImageData = floydSteinbergDither(imageData)
      } else {
        processedImageData = quantizeToNearestColor(imageData)
      }

      ctx.putImageData(processedImageData, 0, 0)

      // 処理済みキャンバスを保存
      setProcessedCanvas(canvas)

      // プレビュー表示
      setShowPreview(true)
      setProcessing(false)
    }, 100)
  }

  return (
    <>
      <div className="setting">
        <label htmlFor="imageInput" className="upload-area">
          <div className="upload-icon">
            <img src={imageLogo} alt="image logo" />
          </div>
          <p>クリックして画像を選択してください</p>
          <input
            type="file"
            id="imageInput"
            accept="image/*"
            style={{ display: "none" }}
            onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          />
        </label>

        <div className="controls">
          <div className="control-group">
            <label htmlFor="blockSize">ピクセルブロックサイズ: {blockSize}</label>
            <input
              type="range"
              min="1"
              max="12"
              value={blockSize}
              onChange={(e) => setBlockSize(parseInt(e.target.value))}
            />
          </div>
          <div className="control-group">
            <div className="checkbox-group">
              <input
                type="checkbox"
                id="ditherCheck"
                checked={ditherChecked}
                onChange={(e) => setDitherChecked(e.target.checked)}
              />
              <label htmlFor="ditherCheck">Floyd-Steinbergディザリング</label>
            </div>
            <div className="checkbox-group">
              <input
                type="checkbox"
                id="noPixelateCheck"
                checked={noPixelateChecked}
                onChange={(e) => setNoPixelateChecked(e.target.checked)}
              />
              <label htmlFor="noPixelateCheck">ピクセル化をスキップ</label>
            </div>
          </div>
        </div>
      </div>

      <button
        className="process-btn"
        disabled={!currentImage || processing}
        onClick={processImage}
      >画像を処理</button>

      {processing && (
        <div className="processing">
          <div className="spinner"></div>
          <p>処理中...</p>
        </div>
      )}

      {(showPreview && processedCanvas) && (
        <ImagePreview
          processedCanvas={processedCanvas}
          currentBlockSize={currentBlockSize.current}
        />
      )}
    </>
  )
}
