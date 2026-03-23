import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import gifenc from "gifenc"
import { PNG } from "pngjs"

const { GIFEncoder, quantize, applyPalette } = gifenc

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(scriptDir, "..", "..")
const framesRoot = path.join(rootDir, "tmp", "demo-capture", "frames")
const outputDir = path.join(rootDir, "assets", "demo", "gifs")

const CLIP_ORDER = [
  "settings-and-bootstrap",
  "resume-to-fill-flow",
  "fill-form-and-autofill",
  "save-and-tracker-workspace",
  "advanced-form-support"
]

const COMPOSE_GAP = 24

function delayForFrame(index, total) {
  if (index === 0 || index === total - 1) return 1200
  return 900
}

async function readPng(filePath) {
  const buffer = await fs.readFile(filePath)
  return PNG.sync.read(buffer)
}

function flattenToWhite(png) {
  const flattened = Buffer.alloc(png.width * png.height * 4)

  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i]
    const g = png.data[i + 1]
    const b = png.data[i + 2]
    const a = png.data[i + 3] / 255

    flattened[i] = Math.round(r * a + 255 * (1 - a))
    flattened[i + 1] = Math.round(g * a + 255 * (1 - a))
    flattened[i + 2] = Math.round(b * a + 255 * (1 - a))
    flattened[i + 3] = 255
  }

  return {
    width: png.width,
    height: png.height,
    data: flattened
  }
}

function createWhiteCanvas(width, height) {
  const data = Buffer.alloc(width * height * 4, 255)
  return { width, height, data }
}

function blit(source, target, offsetX, offsetY) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const srcIndex = (y * source.width + x) * 4
      const dstX = offsetX + x
      const dstY = offsetY + y

      if (dstX < 0 || dstY < 0 || dstX >= target.width || dstY >= target.height) continue

      const dstIndex = (dstY * target.width + dstX) * 4
      target.data[dstIndex] = source.data[srcIndex]
      target.data[dstIndex + 1] = source.data[srcIndex + 1]
      target.data[dstIndex + 2] = source.data[srcIndex + 2]
      target.data[dstIndex + 3] = 255
    }
  }
}

async function loadFrameGroups(clipDir) {
  const entries = await fs.readdir(clipDir).catch(() => [])
  const pngEntries = entries
    .filter((entry) => entry.endsWith(".png"))
    .sort((left, right) => left.localeCompare(right))

  const groups = new Map()

  for (const entry of pngEntries) {
    const key = entry.replace(/-(page|panel)\.png$/, "").replace(/\.png$/, "")
    const kind = entry.endsWith("-page.png") ? "page" : entry.endsWith("-panel.png") ? "panel" : "single"
    const existing = groups.get(key) || { key, page: null, panel: null, single: null }
    existing[kind] = path.join(clipDir, entry)
    groups.set(key, existing)
  }

  return Array.from(groups.values()).sort((left, right) => left.key.localeCompare(right.key))
}

async function buildOutputFrames(clipDir) {
  const groups = await loadFrameGroups(clipDir)
  const frames = []

  for (const group of groups) {
    if (group.page && group.panel) {
      const page = flattenToWhite(await readPng(group.page))
      const panel = flattenToWhite(await readPng(group.panel))
      const width = page.width + COMPOSE_GAP + panel.width
      const height = Math.max(page.height, panel.height)
      const canvas = createWhiteCanvas(width, height)
      blit(page, canvas, 0, Math.max(0, Math.floor((height - page.height) / 2)))
      blit(panel, canvas, page.width + COMPOSE_GAP, Math.max(0, Math.floor((height - panel.height) / 2)))
      frames.push({ key: group.key, ...canvas })
      continue
    }

    if (group.single) {
      const single = flattenToWhite(await readPng(group.single))
      frames.push({ key: group.key, ...single })
    }
  }

  return frames
}

async function exportClip(clipName) {
  const clipDir = path.join(framesRoot, clipName)
  const decodedFrames = await buildOutputFrames(clipDir)

  if (decodedFrames.length === 0) {
    return null
  }

  const width = Math.max(...decodedFrames.map((frame) => frame.width))
  const height = Math.max(...decodedFrames.map((frame) => frame.height))
  const normalizedFrames = decodedFrames.map((frame) => {
    if (frame.width === width && frame.height === height) return frame
    const canvas = createWhiteCanvas(width, height)
    const offsetX = Math.max(0, Math.floor((width - frame.width) / 2))
    const offsetY = Math.max(0, Math.floor((height - frame.height) / 2))
    blit(frame, canvas, offsetX, offsetY)
    return { key: frame.key, ...canvas }
  })

  const encoder = GIFEncoder()
  const combinedPixels = Buffer.concat(normalizedFrames.map((frame) => frame.data))
  const globalPalette = quantize(combinedPixels, 256)

  normalizedFrames.forEach((frame, index) => {
    const indexed = applyPalette(frame.data, globalPalette)
    encoder.writeFrame(indexed, width, height, {
      palette: globalPalette,
      delay: delayForFrame(index, normalizedFrames.length),
      repeat: index === 0 ? 0 : undefined
    })
  })

  encoder.finish()
  await fs.mkdir(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `${clipName}.gif`)
  await fs.writeFile(outputPath, Buffer.from(encoder.bytes()))
  return outputPath
}

async function main() {
  const written = []

  for (const clipName of CLIP_ORDER) {
    const outputPath = await exportClip(clipName)
    if (outputPath) {
      written.push(path.relative(rootDir, outputPath))
    }
  }

  if (written.length === 0) {
    throw new Error("No demo frames found. Run the Playwright demo capture first.")
  }

  console.log("Generated demo GIF assets:")
  for (const file of written) {
    console.log(`- ${file}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exit(1)
})
