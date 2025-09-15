/** 画像サイズをブロックサイズで割り切れるように調整 */
export function adjustImageSize(originalWidth: number, originalHeight: number, blockSize: number) {
    const adjustedWidth = Math.floor(originalWidth / blockSize) * blockSize
    const adjustedHeight = Math.floor(originalHeight / blockSize) * blockSize

    // 最小サイズを保証（少なくとも1ブロック分）
    return {
        width: Math.max(adjustedWidth, blockSize),
        height: Math.max(adjustedHeight, blockSize)
    }
}

/** 画像をピクセル化する */
export function pixelateImage(canvas: HTMLCanvasElement, blockSize: number) {
    if (blockSize <= 1) return // ブロックサイズが1以下の場合はピクセル化しない

    const ctx = canvas.getContext('2d')
    const originalWidth = canvas.width
    const originalHeight = canvas.height

    // 小さいサイズにリサイズ
    const smallWidth = Math.max(1, Math.floor(originalWidth / blockSize))
    const smallHeight = Math.max(1, Math.floor(originalHeight / blockSize))

    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = smallWidth
    tempCanvas.height = smallHeight
    const tempCtx = tempCanvas.getContext('2d')
    if (!ctx || !tempCtx) return

    // 最近傍補間でリサイズ
    tempCtx.imageSmoothingEnabled = false
    tempCtx.drawImage(canvas, 0, 0, smallWidth, smallHeight)

    // 元のサイズに戻す
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, originalWidth, originalHeight)
    ctx.drawImage(tempCanvas, 0, 0, originalWidth, originalHeight)

    return canvas
}

/** アルファチャンネルを平坦化 */
export function flattenAlpha(imageData: ImageData) {
    const data = imageData.data
    const backgroundColor = { r: 255, g: 255, b: 255 } // 背景色を白に設定

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const a = data[i + 3]

        if (a < 255) {
            const alpha = a / 255
            data[i] = Math.round(r * alpha + backgroundColor.r * (1 - alpha))
            data[i + 1] = Math.round(g * alpha + backgroundColor.g * (1 - alpha))
            data[i + 2] = Math.round(b * alpha + backgroundColor.b * (1 - alpha))
            data[i + 3] = 255 // アルファ値を不透明に
        }
    }
}

/** 最近傍パレット色を見つける */
function findNearestPaletteColor(r: number, g: number, b: number, palette: number[][]) {
    let minDistance = Infinity
    let nearestColor = palette[0]

    for (const color of palette) {
        const distance = Math.pow(r - color[0], 2) +
            Math.pow(g - color[1], 2) +
            Math.pow(b - color[2], 2)
        if (distance < minDistance) {
            minDistance = distance
            nearestColor = color
        }
    }
    return nearestColor
}

/** Floyd-Steinbergディザリング */
export function floydSteinbergDither(imageData: ImageData, palette: number[][]) {
    const data = new Uint8ClampedArray(imageData.data)
    const width = imageData.width
    const height = imageData.height

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4
            const oldR = data[idx]
            const oldG = data[idx + 1]
            const oldB = data[idx + 2]

            const [newR, newG, newB] = findNearestPaletteColor(oldR, oldG, oldB, palette)

            data[idx] = newR
            data[idx + 1] = newG
            data[idx + 2] = newB

            const errR = oldR - newR
            const errG = oldG - newG
            const errB = oldB - newB

            // エラー拡散
            if (x + 1 < width) {
                const rightIdx = (y * width + x + 1) * 4
                data[rightIdx] = Math.max(0, Math.min(255, data[rightIdx] + errR * 7 / 16))
                data[rightIdx + 1] = Math.max(0, Math.min(255, data[rightIdx + 1] + errG * 7 / 16))
                data[rightIdx + 2] = Math.max(0, Math.min(255, data[rightIdx + 2] + errB * 7 / 16))
            }

            if (y + 1 < height) {
                if (x > 0) {
                    const bottomLeftIdx = ((y + 1) * width + x - 1) * 4
                    data[bottomLeftIdx] = Math.max(0, Math.min(255, data[bottomLeftIdx] + errR * 3 / 16))
                    data[bottomLeftIdx + 1] = Math.max(0, Math.min(255, data[bottomLeftIdx + 1] + errG * 3 / 16))
                    data[bottomLeftIdx + 2] = Math.max(0, Math.min(255, data[bottomLeftIdx + 2] + errB * 3 / 16))
                }

                const bottomIdx = ((y + 1) * width + x) * 4
                data[bottomIdx] = Math.max(0, Math.min(255, data[bottomIdx] + errR * 5 / 16))
                data[bottomIdx + 1] = Math.max(0, Math.min(255, data[bottomIdx + 1] + errG * 5 / 16))
                data[bottomIdx + 2] = Math.max(0, Math.min(255, data[bottomIdx + 2] + errB * 5 / 16))

                if (x + 1 < width) {
                    const bottomRightIdx = ((y + 1) * width + x + 1) * 4
                    data[bottomRightIdx] = Math.max(0, Math.min(255, data[bottomRightIdx] + errR * 1 / 16))
                    data[bottomRightIdx + 1] = Math.max(0, Math.min(255, data[bottomRightIdx + 1] + errG * 1 / 16))
                    data[bottomRightIdx + 2] = Math.max(0, Math.min(255, data[bottomRightIdx + 2] + errB * 1 / 16))
                }
            }
        }
    }

    return new ImageData(data, width, height)
}

/** 最近傍量子化 */
export function quantizeToNearestColor(imageData: ImageData, palette: number[][]) {
    const data = imageData.data

    for (let i = 0; i < data.length; i += 4) {
        const [r, g, b] = findNearestPaletteColor(data[i], data[i + 1], data[i + 2], palette)
        data[i] = r
        data[i + 1] = g
        data[i + 2] = b
    }

    return imageData
}

/** RGBをHEXに変換 */
export function rgbToHex(r: number, g: number, b: number) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}
