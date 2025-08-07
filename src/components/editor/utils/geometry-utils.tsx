import { Sphere } from '@react-three/drei'
import { saveAs } from 'file-saver'
import { useMemo, useState } from 'react'
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
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
  Vector3,
  type Color,
  type Plane,
} from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { GLTFExporter } from 'three/examples/jsm/Addons.js'
import type { EditorState, SelectedPoint } from '../type'
import type { ThreeEvent } from '@react-three/fiber'

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

/**
 * Renders a 3D landmark point with an optional label and selection highlighting.
 *
 * Displays a sphere at the given point's position, and, if `landmarkLabelsVisible` is true,
 * draws a line and a sprite label at a fixed offset in the direction of the point's normal.
 *
 * @param props - The props object.
 * @param props.point - The landmark point to render, including position, id, and normal.
 * @param props.editorState - The current editor state; enables selection if set to 'landmarks'.
 * @param props.selectedLandmarkId - The id of the currently selected landmark, if any.
 * @param props.setSelectedLandmarkId - Callback to update the selected landmark id.
 * @param props.landmarkLabelsVisible - Whether to show the label and anchor line for the landmark (default: true).
 *
 * @returns A React group containing the landmark sphere, optional anchor line, and label sprite.
 */
export const LandmarkWithLabel = ({
  point,
  editorState,
  selectedLandmarkId,
  setSelectedLandmarkId,
  landmarkLabelsVisible = true,
}: {
  point: SelectedPoint
  editorState?: EditorState
  selectedLandmarkId?: number | null
  setSelectedLandmarkId?: (id: number | null) => void
  landmarkLabelsVisible?: boolean
}) => {
  const [hovered, setHovered] = useState(false)
  const handleLandmarkClick = (
    event: ThreeEvent<MouseEvent>,
    point: SelectedPoint,
  ) => {
    event.stopPropagation()

    if (setSelectedLandmarkId) {
      if (point.id === selectedLandmarkId) {
        setSelectedLandmarkId(null) // Deselect if already selected
      } else {
        setSelectedLandmarkId(point.id) // Select the clicked landmark
      }
    }
  }

  // Fixed sphere radius - no size change when selected
  const sphereRadius = 0.001
  const spriteScale = sphereRadius * 2 * 2

  // Use the stored normal instead of calculating from mesh center
  const direction = point.normal.clone().normalize()

  // Define sprite distance from the landmark point
  const spriteDistance = 0.02 // Fixed distance for sprite positioning

  // Calculate sprite position
  const spriteX = point.position.x + direction.x * spriteDistance
  const spriteY = point.position.y + direction.y * spriteDistance
  const spriteZ = point.position.z + direction.z * spriteDistance

  const spriteVector = new Vector3(spriteX, spriteY, spriteZ)

  const spriteLabelMaterial = useMemo(() => {
    const isSelected = point.id === selectedLandmarkId
    const canvas = createLabelCanvas(String(point.id), isSelected)
    return new CanvasTexture(canvas)
  }, [point.id, selectedLandmarkId === point.id])

  const selectedColor = '#ffeb3b' // softer yellow
  const sphereColor = '#ff0000' // pure red

  return (
    <group key={point.id} name={`landmark-group-${point.id}`}>
      <Sphere
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        args={[sphereRadius, 64, 64]}
        onDoubleClick={(event) =>
          editorState === 'landmarks'
            ? handleLandmarkClick(event, point)
            : undefined
        }
        name={`landmark-${point.id}`}
        position={[point.position.x, point.position.y, point.position.z]}
      >
        <meshPhongMaterial
          color={point.id === selectedLandmarkId ? selectedColor : sphereColor}
          emissive={hovered ? selectedColor : sphereColor}
          emissiveIntensity={0.5}
        />
      </Sphere>

      {landmarkLabelsVisible && (
        <>
          {/* Anchor line - using Line2 constructor */}
          <DefaultLine
            start={point.position}
            end={spriteVector}
            color="#666"
            name={`landmark-line-${point.id}`}
          />

          {/* Text sprite - positioned at fixed distance */}
          <sprite
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
            onDoubleClick={(event) =>
              editorState === 'landmarks'
                ? handleLandmarkClick(event, point)
                : undefined
            }
            name={`landmark-sprite-${point.id}`}
            position={[spriteX, spriteY, spriteZ]}
            scale={[spriteScale, spriteScale, 1]}
          >
            <spriteMaterial
              map={spriteLabelMaterial}
              transparent={true}
              alphaTest={0.1}
            />
          </sprite>
        </>
      )}
    </group>
  )
}

/**
 * Highly optimized BVH-based clipping that focuses on performance.
 * @param mesh The mesh to clip
 * @param plane The clipping plane
 * @param debug Whether to output timing information (default: false)
 */
export const optimizedBvhClip = (
  mesh: Mesh,
  plane: Plane,
  debug: boolean = false,
): Mesh => {
  if (debug) console.time('BVH Clip')

  // Clone the mesh to avoid modifying the original
  const clonedMesh = mesh.clone()
  const geometry = clonedMesh.geometry as BufferGeometry

  // Ensure the geometry has a BVH
  if (!geometry.boundsTree) {
    if (debug) console.time('BVH Build')
    const bvh = new MeshBVH(geometry)
    geometry.boundsTree = bvh
    if (debug) console.timeEnd('BVH Build')
  }

  // Get positions and indices
  const positionAttribute = geometry.getAttribute('position') as BufferAttribute
  const indices = geometry.index

  // Pre-allocate reusable vectors to avoid creating new ones during traversal
  const center = new Vector3()
  const halfSize = new Vector3()
  const v1 = new Vector3()
  const v2 = new Vector3()
  const v3 = new Vector3()

  // Use a simple array instead of a Set for better performance
  // We'll use a bit array for even better performance with large meshes
  const triangleCount = indices
    ? indices.count / 3
    : positionAttribute.count / 3

  // Create a bit array (Uint8Array where each bit represents a triangle)
  // This is much more memory efficient than a Set for large meshes
  const triangleBits = new Uint8Array(Math.ceil(triangleCount / 8))

  // Function to set a bit in the bit array
  const setBit = (index: number) => {
    const byteIndex = Math.floor(index / 8)
    const bitPosition = index % 8
    triangleBits[byteIndex] |= 1 << bitPosition
  }

  // Function to check if a bit is set
  const isBitSet = (index: number) => {
    const byteIndex = Math.floor(index / 8)
    const bitPosition = index % 8
    return (triangleBits[byteIndex] & (1 << bitPosition)) !== 0
  }

  // Use the BVH to efficiently determine which triangles to keep
  const bvh = geometry.boundsTree as MeshBVH

  if (debug) console.time('BVH Traversal')

  // Quick check if the entire mesh is on one side of the plane
  const box =
    geometry.boundingBox || new Box3().setFromBufferAttribute(positionAttribute)

  // Calculate distance from box to plane
  center.copy(box.min).add(box.max).multiplyScalar(0.5)
  halfSize.copy(box.max).sub(box.min).multiplyScalar(0.5)

  // Project half-extents onto plane normal
  const r =
    halfSize.x * Math.abs(plane.normal.x) +
    halfSize.y * Math.abs(plane.normal.y) +
    halfSize.z * Math.abs(plane.normal.z)

  // Distance from center to plane
  const d = plane.distanceToPoint(center)

  // If the entire mesh is behind the plane, return an empty mesh
  if (d < -r) {
    if (debug) console.timeEnd('BVH Traversal')
    if (debug) console.timeEnd('BVH Clip')

    // Return an empty mesh
    const emptyGeometry = new BufferGeometry()
    const emptyMesh = new Mesh(emptyGeometry, clonedMesh.material)
    emptyMesh.position.copy(mesh.position)
    emptyMesh.rotation.copy(mesh.rotation)
    emptyMesh.scale.copy(mesh.scale)
    return emptyMesh
  }

  // If the entire mesh is in front of the plane, return the original mesh
  if (d > r) {
    if (debug) console.timeEnd('BVH Traversal')
    if (debug) console.timeEnd('BVH Clip')
    return clonedMesh
  }

  // Identify triangles to keep
  bvh.shapecast({
    intersectsBounds: (box, isLeaf) => {
      // Calculate distance from box to plane
      center.copy(box.min).add(box.max).multiplyScalar(0.5)
      halfSize.copy(box.max).sub(box.min).multiplyScalar(0.5)

      // Project half-extents onto plane normal
      const r =
        halfSize.x * Math.abs(plane.normal.x) +
        halfSize.y * Math.abs(plane.normal.y) +
        halfSize.z * Math.abs(plane.normal.z)

      // Distance from center to plane
      const d = plane.distanceToPoint(center)

      // If box is entirely behind plane, skip this subtree
      if (d < -r) {
        return false
      }

      // If box is entirely in front of plane and this is a leaf node,
      // mark all triangles in this node
      if (d > r && isLeaf) {
        // We need to mark all triangles in this leaf node
        // The BVH doesn't directly expose this information, so we'll
        // return true and let intersectsTriangle handle it with the
        // contained flag
        return true
      }

      // Box intersects plane, continue traversal
      return true
    },

    intersectsTriangle: (triangle, triangleIndex, contained) => {
      // If the triangle is in a node that's entirely in front of the plane,
      // mark it without testing
      if (contained) {
        setBit(triangleIndex)
        return false
      }

      // For triangles that might intersect the plane, check individually
      const i0 = indices ? indices.array[triangleIndex * 3] : triangleIndex * 3
      const i1 = indices
        ? indices.array[triangleIndex * 3 + 1]
        : triangleIndex * 3 + 1
      const i2 = indices
        ? indices.array[triangleIndex * 3 + 2]
        : triangleIndex * 3 + 2

      v1.fromBufferAttribute(positionAttribute, i0)
      v2.fromBufferAttribute(positionAttribute, i1)
      v3.fromBufferAttribute(positionAttribute, i2)

      const d1 = plane.distanceToPoint(v1)
      const d2 = plane.distanceToPoint(v2)
      const d3 = plane.distanceToPoint(v3)

      // If all vertices are on or in front of the plane, keep this triangle
      if (d1 >= 0 && d2 >= 0 && d3 >= 0) {
        setBit(triangleIndex)
      }

      return false // Continue traversal
    },
  })
  if (debug) console.timeEnd('BVH Traversal')

  if (debug) console.time('Geometry Filtering')

  // Count how many triangles we're keeping to pre-allocate arrays
  let keepCount = 0
  for (let i = 0; i < triangleCount; i++) {
    if (isBitSet(i)) {
      keepCount++
    }
  }

  // If we're keeping all triangles, return the original mesh
  if (keepCount === triangleCount) {
    if (debug) console.timeEnd('Geometry Filtering')
    if (debug) console.timeEnd('BVH Clip')
    return clonedMesh
  }

  // If we're keeping no triangles, return an empty mesh
  if (keepCount === 0) {
    if (debug) console.timeEnd('Geometry Filtering')
    if (debug) console.timeEnd('BVH Clip')

    // Return an empty mesh
    const emptyGeometry = new BufferGeometry()
    const emptyMesh = new Mesh(emptyGeometry, clonedMesh.material)
    emptyMesh.position.copy(mesh.position)
    emptyMesh.rotation.copy(mesh.rotation)
    emptyMesh.scale.copy(mesh.scale)
    return emptyMesh
  }

  // Create a new filtered index array with pre-allocated size
  const newIndices = new Uint32Array(keepCount * 3)
  let indexOffset = 0

  // Add indices for triangles to keep
  for (let i = 0; i < triangleCount; i++) {
    if (isBitSet(i)) {
      if (indices) {
        // For indexed geometry
        newIndices[indexOffset++] = indices.array[i * 3]
        newIndices[indexOffset++] = indices.array[i * 3 + 1]
        newIndices[indexOffset++] = indices.array[i * 3 + 2]
      } else {
        // For non-indexed geometry
        newIndices[indexOffset++] = i * 3
        newIndices[indexOffset++] = i * 3 + 1
        newIndices[indexOffset++] = i * 3 + 2
      }
    }
  }

  // Create a new geometry by cloning the original and setting the new indices
  // Use a more efficient approach to avoid full geometry cloning
  const clippedGeometry = new BufferGeometry()

  // Copy all attributes from the original geometry
  Object.keys(geometry.attributes).forEach((name) => {
    const attr = geometry.attributes[name]
    if (attr instanceof BufferAttribute) {
      clippedGeometry.setAttribute(name, attr.clone())
    }
  })

  // Set the new index buffer
  clippedGeometry.setIndex(new BufferAttribute(newIndices, 1))

  // Create a new mesh with the clipped geometry
  const clippedMesh = new Mesh(clippedGeometry, clonedMesh.material)

  // Copy transformation from the original mesh
  clippedMesh.position.copy(mesh.position)
  clippedMesh.rotation.copy(mesh.rotation)
  clippedMesh.scale.copy(mesh.scale)

  if (debug) console.timeEnd('Geometry Filtering')
  if (debug) console.timeEnd('BVH Clip')

  return clippedMesh
}
