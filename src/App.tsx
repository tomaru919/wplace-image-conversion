import { useState, useRef, useEffect, useCallback } from "react"
import { adjustImageSize, pixelateImage, flattenAlpha, floydSteinbergDither, quantizeToNearestColor, rgbToHex } from "@/lib/functions"
import { COLOR_NAME_MAP, DEFAULT_COLORS, SELECTABLE_COLORS } from "@/lib/palette"

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
  }, [processedCanvas, zoomLevel])

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
        newX = (containerWidth - newCanvasWidth) / 2
      }

      // Y軸
      if (newCanvasHeight > containerHeight) {
        const minY = containerHeight - newCanvasHeight
        newY = Math.max(minY, Math.min(newY, 0))
      } else {
        newY = (containerHeight - newCanvasHeight) / 2
      }

      setCanvasPosition({ x: newX, y: newY })
      setInitialPosition({ x: newX, y: newY })
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
    if (canvasRef.current) {
      if (isDragging && containerRef.current) {
        e.preventDefault()

        const container = containerRef.current
        const canvasWidth = canvasRef.current.width
        const canvasHeight = canvasRef.current.height
        const containerWidth = container.clientWidth
        const containerHeight = container.clientHeight

        let newX = initialPosition.x + (e.clientX - dragStart.x)
        let newY = initialPosition.y + (e.clientY - dragStart.y)

        if (canvasWidth > containerWidth) {
          const minX = containerWidth - canvasWidth
          newX = Math.max(minX, Math.min(newX, 0))
        } else {
          newX = (containerWidth - canvasWidth) / 2
        }

        if (canvasHeight > containerHeight) {
          const minY = containerHeight - canvasHeight
          newY = Math.max(minY, Math.min(newY, 0))
        } else {
          newY = (containerHeight - canvasHeight) / 2
        }
        setCanvasPosition({ x: newX, y: newY })
      }

      const rect = canvasRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      const pixelInfo = getPixelColor(x, y)
      if (pixelInfo) {
        const colorName = COLOR_NAME_MAP[pixelInfo.color.toLowerCase()] || 'Unknown Color'
        setColorInfo({
          show: !isDragging,
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
      x: e.clientX,
      y: e.clientY
    })
  }

  function handleMouseUp() {
    if (isDragging) {
      setIsDragging(false)
      setInitialPosition(canvasPosition)

      //showの値のみを変更して他は元々の値を使う color-info要素の表示
      setColorInfo(prev => ({
        show: true,
        x: prev["x"],
        y: prev["y"],
        text: prev["text"]
      }))
    }
  }

  function handleMouseLeave() {
    if (isDragging) {
      setIsDragging(false)
      setInitialPosition(canvasPosition)
    }
    setColorInfo({ show: false, x: 0, y: 0, text: '' })
  }

  function handleTouchStart(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault()
    setIsDragging(true)
    const touch = e.touches[0]
    setDragStart({
      x: touch.clientX,
      y: touch.clientY
    })
  }

  function handleTouchMove(e: React.TouchEvent<HTMLCanvasElement>) {
    if (canvasRef.current) {
      if (isDragging && containerRef.current) {
        e.preventDefault()
        const touch = e.touches[0]

        const container = containerRef.current
        const canvasWidth = canvasRef.current.width
        const canvasHeight = canvasRef.current.height
        const containerWidth = container.clientWidth
        const containerHeight = container.clientHeight

        let newX = initialPosition.x + (touch.clientX - dragStart.x)
        let newY = initialPosition.y + (touch.clientY - dragStart.y)

        if (canvasWidth > containerWidth) {
          const minX = containerWidth - canvasWidth
          newX = Math.max(minX, Math.min(newX, 0))
        } else {
          newX = (containerWidth - canvasWidth) / 2
        }

        if (canvasHeight > containerHeight) {
          const minY = containerHeight - canvasHeight
          newY = Math.max(minY, Math.min(newY, 0))
        } else {
          newY = (containerHeight - canvasHeight) / 2
        }
        setCanvasPosition({ x: newX, y: newY })
      }
    }
  }

  function handleTouchEnd() {
    if (isDragging) {
      setIsDragging(false)
      setInitialPosition(canvasPosition)
    }
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
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
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

function SelectColors({
  selectedColors,
  setSelectedColors
}: {
  selectedColors: { [key: string]: boolean }
  setSelectedColors: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>
}) {
  /** カラー選択のハンドラ */
  function handleColorSelectionChange(colorName: string) {
    setSelectedColors(prev => ({
      ...prev,
      [colorName]: !prev[colorName]
    }))
  }

  function selectAllColor() {
    setSelectedColors(prev => {
      const state: { [key: string]: boolean } = {}
      for (const color of Object.keys(prev)) {
        state[color] = true
      }
      return state
    })
  }

  function deselectAllColors() {
    setSelectedColors(prev => {
      const state: { [key: string]: boolean } = {}
      for (const color of Object.keys(prev)) {
        state[color] = false
      }
      return state
    })
  }

  return (
    <div className="color-settings-container">
      <div className="control-group color-selection">
        <div className="color-selection-header">
          <label>追加カラーパレット:</label>
          <div className="color-selection-controls">
            <button onClick={selectAllColor}>すべて選択</button>
            <button onClick={deselectAllColors}>すべて解除</button>
          </div>
        </div>
        <div className="color-checkboxes">
          {SELECTABLE_COLORS.map(color => (
            <div className="checkbox-group" key={color.name}>
              <input
                type="checkbox"
                id={`color-${color.name}`}
                checked={selectedColors[color.name]}
                onChange={() => handleColorSelectionChange(color.name)}
              />
              <span className="color-swatch" style={{ backgroundColor: color.hex }}></span>
              <label htmlFor={`color-${color.name}`}>{color.name}</label>
            </div>
          ))}
        </div>
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
    [showPreview, setShowPreview] = useState(false),
    [selectedColors, setSelectedColors] = useState(() => {
      const initialState: { [key: string]: boolean } = {}
      SELECTABLE_COLORS.forEach(color => {
        initialState[color.name] = true
      })
      return initialState
    })

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
      // 最終的なパレットを作成
      const finalPalette = [...DEFAULT_COLORS]
      SELECTABLE_COLORS.forEach(color => {
        if (selectedColors[color.name]) {
          finalPalette.push(color)
        }
      })

      // HEX to RGB
      const finalPaletteRGB = finalPalette.map(c => {
        const r = parseInt(c.hex.slice(1, 3), 16)
        const g = parseInt(c.hex.slice(3, 5), 16)
        const b = parseInt(c.hex.slice(5, 7), 16)
        return [r, g, b]
      })

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
        processedImageData = floydSteinbergDither(imageData, finalPaletteRGB)
      } else {
        processedImageData = quantizeToNearestColor(imageData, finalPaletteRGB)
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
          {currentImage ? (
            <img src={currentImage.src} alt="Upload preview" className="upload-preview-image" />
          ) : (
            <div className="upload-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96" shape-rendering="crispEdges">
                <path fill="#fff" d="M4 3h16v1H4zm-1 1h18v1H3zm-1 1h2v15H2zm18 0h2v15h-2zM3 20h18v1H3zm1 1h16v1H4zM8 7h2v1H8zM7 8h4v1H7zM6 9h2v2H6zm4 0h2v2h-2zM7 11h4v1H7zm1 1h2v1H8zm7-2h2v1h-2zm-1 1h4v1h-4zm-1 1h6v1h-6zm-1 1h3v1h-3zm5 0h3v1h-3zm-6 1h3v1h-3zm7 0h2v1h-2zm-8 1h3v1h-3zm9 0h1v1h-1zm-10 1h3v1H9zm-1 1h3v1H8zm-1 1h3v1H7zm-1 1h3v1H6z" />
              </svg>
            </div>
          )}
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
              min="2"
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



      <SelectColors selectedColors={selectedColors} setSelectedColors={setSelectedColors} />

      <button
        className="process-btn"
        disabled={!currentImage || processing}
        onClick={processImage}
      >画像を処理</button>

      {processing && (
        <div className="processing">
          <div className="loader">
            <div className="loader-dot"></div>
            <div className="loader-dot"></div>
            <div className="loader-dot"></div>
          </div>
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
