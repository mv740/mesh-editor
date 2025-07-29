import { saveAs } from 'file-saver'
import React, { useMemo } from 'react'
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshMatcapMaterial,
  MeshNormalMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  type Color,
  type Vector3,
} from 'three'
import { GLTFExporter } from 'three/examples/jsm/Addons.js'

type DefaultLineProps = {
  start: Vector3
  end: Vector3
  color?: string
  name?: string
}

export const DefaultLine = ({
  start,
  end,
  color = 'white',
  name,
}: DefaultLineProps) => {
  const positions = useMemo(
    () => [...start.toArray(), ...end.toArray()],
    [start, end],
  )

  const geometry = useMemo(() => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    return geometry
  }, [positions])

  const material = useMemo(() => new LineBasicMaterial({ color }), [color])

  const line = useMemo(() => {
    const line = new Line(geometry, material)
    if (name) line.name = name
    return line
  }, [geometry, material, name])

  return <primitive object={line} name={name} />
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

/**
 * Saves a file using the provided Blob and filename.
 *
 * @param blob The Blob object to be saved
 * @param filename The name of the file to be saved
 */
export const saveFile = (blob: Blob, filename: string) => {
  saveAs(blob, filename)
}

// useful for debugging
export const createSphereMarker = (
  position: Vector3,
  color: Color | number | string = 0xff0000,
): Mesh => {
  const geometry = new SphereGeometry(0.01, 16, 16)
  const material = new MeshBasicMaterial({ color })
  const sphere = new Mesh(geometry, material)
  sphere.position.copy(position)
  return sphere
}

/**
 * Exports the mesh and landmark data from a Three.js scene referenced by `sceneRef` into a GLTF or GLB file.
 *
 * This function traverses the scene, clones meshes whose names start with "inputMesh", and converts their materials
 * to `MeshStandardMaterial` if necessary for GLTF compatibility. It also processes landmark groups, exporting only
 * their mesh and sprite children (sprites are converted to planes with the same texture, and lines are renamed).
 * The resulting export is saved as either a `.glb` (binary) or `.gltf` (JSON) file.
 *
 * @param sceneRef - A React ref object pointing to the Three.js `Scene` to export from.
 * @param opacity - The opacity value to apply to exported mesh materials if not already set.
 */
export const exportMesh = (
  sceneRef: React.RefObject<Scene | null>,
  opacity: number,
) => {
  if (sceneRef.current) {
    const gltfExporter = new GLTFExporter()
    const exportScene = new Scene()

    sceneRef.current.traverse((object) => {
      // Look for objects with names starting with "model-"
      if (object.type === 'Mesh' && object.name.startsWith('inputMesh')) {
        const copy = object.clone()
        if (copy instanceof Mesh) {
          // wireframe convert mesh to lines
          copy.material.wireframe = false

          // Convert unsupported materials to MeshStandardMaterial for GLTF compatibility
          if (
            [MeshNormalMaterial, MeshMatcapMaterial, MeshPhongMaterial].some(
              (Mat) => copy.material instanceof Mat,
            )
          ) {
            const oldMaterial = copy.material
            const newMaterial = new MeshStandardMaterial({
              opacity: oldMaterial.opacity || opacity,
              transparent: oldMaterial.transparent || opacity < 1,
              roughness: 0.7,
              metalness: 0.1,
              flatShading: oldMaterial.flatShading || false,
            })

            copy.material = newMaterial
          }
        }

        exportScene.add(copy)
      }

      if (object.type === 'Group' && object.name.startsWith('landmarks')) {
        // For each landmark group, only export Mesh and Sprite children (exclude lines, etc)
        object.children.forEach((landmarkGroup) => {
          if (
            landmarkGroup.type === 'Group' &&
            landmarkGroup.name.startsWith('landmark-group-')
          ) {
            const landmarkGroupCopy = landmarkGroup.clone()

            landmarkGroup.children.forEach((child) => {
              if (child.type === 'Mesh') {
                landmarkGroupCopy.add(child.clone())
              } else if (child.type === 'Sprite') {
                // Replace Sprite with a Plane mesh using the same texture
                const sprite = child as any // Sprite is not typed on Object3D
                const { position, scale, material } = sprite
                const texture = material && material.map ? material.map : null
                if (texture) {
                  const plane = new Mesh(
                    new PlaneGeometry(1, 1),
                    new MeshBasicMaterial({
                      map: texture,
                      transparent: true,
                      alphaTest: 0.1,
                      side: DoubleSide,
                    }),
                  )
                  plane.name = child.name.replace('sprite', 'label')
                  plane.position.copy(position)
                  plane.scale.copy(scale)
                  landmarkGroupCopy.add(plane)
                }
              } else if (child.type === 'Line') {
                const line = child.clone()
                line.name = `line-${child?.parent?.name.split('-')[2]}`
                landmarkGroupCopy.add(line)
              }
            })
            // Add the filtered group to the export scene
            exportScene.add(landmarkGroupCopy)
          }
        })
      }
    })

    if (exportScene.children.length > 0) {
      gltfExporter.parse(
        exportScene,
        (gltf: ArrayBuffer | { [key: string]: unknown }) => {
          if (gltf instanceof ArrayBuffer) {
            // Handle binary format
            const blob = new Blob([gltf], {
              type: 'application/octet-stream',
            })
            saveFile(blob, 'mesh.glb')
          } else {
            // Handle JSON format
            const blob = new Blob([JSON.stringify(gltf)], {
              type: 'application/json',
            })
            saveFile(blob, 'mesh.gltf')
          }
        },
        (error) => {
          console.error('Error exporting GLTF:', error)
        },
        { binary: true },
      )
    }
  }
}
