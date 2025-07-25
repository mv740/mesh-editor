import { extend } from '@react-three/fiber'
import React, { useMemo } from 'react'
import { Line2, LineGeometry, LineMaterial } from 'three/examples/jsm/Addons.js'
import type { Vector3 } from 'three'

extend({ LineMaterial, LineGeometry, Line2 })

// custom class from treejs must be added to the global scope
declare module '@react-three/fiber' {
  interface ThreeElements {
    line2: ThreeElements['mesh'] & { object?: Line2 }
    lineGeometry: ThreeElements['bufferGeometry'] & { object?: LineGeometry }
    lineMaterial: ThreeElements['shaderMaterial'] & { object?: LineMaterial }
  }
}

type ThickLineProps = {
  start: Vector3
  end: Vector3
  color?: string
  linewidth?: number
  name?: string
}

/**
 * Renders a thick line in a 3D scene using Three.js Line2 geometry.
 *
 *
 * @param {object} props - The properties for rendering the thick line
 * @param {Vector3} props.start - The starting point of the line
 * @param {Vector3} props.end - The ending point of the line
 * @param {string} [props.color] - The color of the line (default is white)
 * @param {number} [props.linewidth] - The width of the line (default is 2)
 * @param {string} [props.name] - Optional name for the line
 * @returns {JSX.Element} A line2 component with the specified geometry and material
 */
export const ThickLine = ({
  start,
  end,
  color = 'white',
  linewidth = 2,
}: ThickLineProps) => {
  const positions = useMemo(
    () => [...start.toArray(), ...end.toArray()],
    [start, end],
  )

  const geometry = useMemo(() => {
    const g = new LineGeometry()
    g.setPositions(positions)
    return g
  }, [positions])

  const material = useMemo(() => {
    return new LineMaterial({
      color,
      linewidth,
    })
  }, [linewidth, color])

  return <line2 geometry={geometry} material={material} />
}

const CANVAS_CONFIG = {
  canvasHeight: 256,
  fontScale: 0.4,
  lineWidth: 25,
  borderColor: '#4F4F4F',
  backColor: '#ffffff',
  selectedColor: '#FFFF00',
  font: 'Arial',
  lineJoin: 'miter',
  miterLimit: 2,
}

export const createLabelCanvas = (
  text: string,
  isSelected: boolean = false,
) => {
  const sizeH = CANVAS_CONFIG.canvasHeight
  const sizeW = sizeH
  const canvas = document.createElement('canvas')
  canvas.width = sizeW
  canvas.height = sizeH
  const context = canvas.getContext('2d')!

  // Choose colors based on selection state
  const borderColor = isSelected
    ? CANVAS_CONFIG.selectedColor
    : CANVAS_CONFIG.backColor // Yellow border if selected, white if not
  const textColor = isSelected
    ? CANVAS_CONFIG.selectedColor
    : CANVAS_CONFIG.backColor // Yellow text if selected, white if not

  // Draw outer circle (background/border)
  context.beginPath()
  context.arc(sizeW / 2, sizeH / 2, sizeW / 2 - 5, 0, Math.PI * 2)
  context.fillStyle = borderColor
  context.fill()

  // Draw inner circle (center) - always dark gray
  context.beginPath()
  context.arc(
    sizeW / 2,
    sizeH / 2,
    sizeW / 2 - CANVAS_CONFIG.lineWidth,
    0,
    Math.PI * 2,
  )
  context.fillStyle = CANVAS_CONFIG.borderColor // Always dark gray center
  context.fill()

  // Draw text with matching color
  context.font = `${sizeH * CANVAS_CONFIG.fontScale}pt ${CANVAS_CONFIG.font}`
  context.textAlign = 'center'
  context.fillStyle = textColor // Yellow text if selected, white if not
  context.lineWidth = CANVAS_CONFIG.lineWidth
  context.lineJoin = CANVAS_CONFIG.lineJoin as CanvasLineJoin
  context.miterLimit = CANVAS_CONFIG.miterLimit

  const textOffsetCenter = (String(text).length - 1) * (sizeW / 35)
  context.fillText(text, sizeW * 0.5 - textOffsetCenter, sizeH * 0.7)

  return canvas
}
