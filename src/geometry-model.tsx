import { Bvh } from '@react-three/drei'
import { useLoader, useThree, type ThreeEvent } from '@react-three/fiber'
import React, { useEffect, useRef } from 'react'
import { CanvasTexture, Vector3, type Mesh } from 'three'

import { STLLoader } from 'three/examples/jsm/Addons.js'
import {
  createLabelCanvas,
  ThickLine,
} from './components/editor/geometry-utils'
import type { EditorState } from './mesh-editor'
export interface SelectedPoint {
  position: Vector3
  normal: Vector3
  id: number
}

interface GeometryModelProps {
  stlUrl: string
  onLoad?: () => void
  onPointSelect?: (point: Vector3, normal: Vector3) => void
  setSelectedLandmarkId?: (id: number | null) => void
  selectedPoints?: SelectedPoint[]
  editorState?: EditorState
  selectedLandmarkId?: number | null
  landmarksVisible?: boolean
  meshOpacity?: number
  wireframeVisible?: boolean
  landmarkLabelsVisible?: boolean
}

// Create a function to generate text texture using the canvas
const createTextTexture = (text: string, isSelected: boolean = false) => {
  const canvas = createLabelCanvas(text, isSelected)
  return new CanvasTexture(canvas)
}

const LandmarkWithLabel = ({
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
  const handleLandmarkClick = (
    event: ThreeEvent<MouseEvent>,
    point: SelectedPoint,
  ) => {
    event.stopPropagation()

    if (setSelectedLandmarkId) {
      setSelectedLandmarkId(point.id)
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

  return (
    <group key={point.id} name={`landmark-group-${point.id}`}>
      {/* Landmark sphere - fixed size */}
      <mesh
        onDoubleClick={(event) =>
          editorState === 'landmarks'
            ? handleLandmarkClick(event, point)
            : undefined
        }
        name={`landmark-${point.id}`}
        key={point.id}
        position={[point.position.x, point.position.y, point.position.z]}
      >
        <sphereGeometry args={[sphereRadius, 16, 16]} />
        <meshStandardMaterial
          color={point.id === selectedLandmarkId ? 'yellow' : 'red'}
        />
      </mesh>

      {landmarkLabelsVisible && (
        <>
          {/* Anchor line - using Line2 constructor */}
          <ThickLine
            start={point.position}
            end={spriteVector}
            color="#666"
            linewidth={2}
            name={`landmark-line-${point.id}`}
          />
          {/* Text sprite - positioned at fixed distance */}
          <sprite
            name={`landmark-sprite-${point.id}`}
            position={[spriteX, spriteY, spriteZ]}
            scale={[spriteScale, spriteScale, 1]}
          >
            <spriteMaterial
              map={createTextTexture(
                String(point.id),
                point.id === selectedLandmarkId,
              )}
              transparent={true}
              alphaTest={0.1}
            />
          </sprite>
        </>
      )}
    </group>
  )
}

export const GeometryModel = ({
  stlUrl,
  onLoad,
  onPointSelect,
  editorState,
  selectedPoints = [],
  landmarksVisible = true,
  selectedLandmarkId, // Add selected landmark ID
  setSelectedLandmarkId,
  meshOpacity = 1, // Default opacity
  wireframeVisible = false, // Default wireframe visibility,
  landmarkLabelsVisible = true,
}: GeometryModelProps) => {
  const geometry = useLoader(STLLoader, stlUrl)
  const meshRef = useRef<Mesh>(null)

  const { camera, gl } = useThree()

  const initialCameraSetupRef = useRef(false)

  const mouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // Pointer move effect here (only once for the whole geometry/model)
  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      mouse.current = {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
      }
    }
    gl.domElement.addEventListener('pointermove', handlePointerMove)
    return () => {
      gl.domElement.removeEventListener('pointermove', handlePointerMove)
    }
  }, [gl])

  // Handle clicks on the mesh
  const handleMeshClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()

    // If the mesh has a BVH, use it for faster raycasting
    if (meshRef.current && meshRef.current.geometry.boundsTree) {
      // The point and normal are already calculated by R3F and available in the event
      const point = event.point.clone()
      const normal = event.face?.normal.clone() || event.normal?.clone()

      if (onPointSelect && normal) {
        onPointSelect(point, normal)
      }
    }

    return true
  }

  useEffect(() => {
    // Only run camera setup once when the model first loads
    if (meshRef.current && !initialCameraSetupRef.current) {
      // Center the model
      meshRef.current.geometry.center()

      // Auto-fit camera to the model
      const box = meshRef.current.geometry.boundingBox
      if (box) {
        // Create proper Vector3 objects for size and center
        const size = box.getSize(new Vector3())
        const center = box.getCenter(new Vector3())

        meshRef.current.position.set(-center.x, -center.y, -center.z)
        camera.position.set(0, 0, size.length() * 2)
        camera.lookAt(0, 0, 0)
        camera.updateProjectionMatrix()
      }

      // Mark that initial setup is complete
      initialCameraSetupRef.current = true

      // Call onLoad when the model is loaded and set up
      if (onLoad) {
        onLoad()
      }
    }
  }, [geometry, camera, onLoad])

  return (
    <Bvh>
      <mesh
        name="inputMesh"
        ref={meshRef}
        onDoubleClick={
          editorState === 'landmarks' ? handleMeshClick : undefined
        }
      >
        <primitive object={geometry} attach="geometry" />
        <meshPhongMaterial
          transparent={true}
          visible={true}
          opacity={meshOpacity}
          wireframe={wireframeVisible}
        />
      </mesh>
      {/* Render selected points */}

      <group name="landmarks">
        {selectedPoints.map(
          (point) =>
            landmarksVisible && (
              <LandmarkWithLabel
                key={point.id}
                point={point}
                setSelectedLandmarkId={setSelectedLandmarkId}
                editorState={editorState}
                selectedLandmarkId={selectedLandmarkId}
                landmarkLabelsVisible={landmarkLabelsVisible}
              />
            ),
        )}
      </group>
    </Bvh>
  )
}
