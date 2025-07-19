import { Bvh } from '@react-three/drei'
import { useLoader, useThree, type ThreeEvent } from '@react-three/fiber'
import React, { useEffect, useRef } from 'react'
import { Vector3, type Mesh } from 'three'
import { STLLoader } from 'three/examples/jsm/Addons.js'
import type { EditorState } from './mesh-editor'

export interface SelectedPoint {
  position: Vector3
  id: number
}

interface GeometryModelProps {
  stlUrl: string
  onLoad?: () => void
  onPointSelect?: (point: Vector3) => void
  selectedPoints?: SelectedPoint[]
  editorState?: EditorState
  selectedLandmarkId?: number | null
  landmarksVisible?: boolean
  meshOpacity?: number
  wireframeVisible?: boolean
}

export const GeometryModel = ({
  stlUrl,
  onLoad,
  onPointSelect,
  editorState,
  selectedPoints = [],
  landmarksVisible = true,
  selectedLandmarkId, // Add selected landmark ID
  meshOpacity = 1, // Default opacity
  wireframeVisible = false, // Default wireframe visibility
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

    console.log('Clicked on mesh')

    // If the mesh has a BVH, use it for faster raycasting
    if (meshRef.current && meshRef.current.geometry.boundsTree) {
      // The point is already calculated by R3F and available in the event
      const point = event.point.clone()

      if (onPointSelect) {
        onPointSelect(point)
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

  console.log('selectedPoints', selectedPoints)

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
              <mesh
                name={`landmark-${point.id}`}
                key={point.id}
                position={[
                  point.position.x,
                  point.position.y,
                  point.position.z,
                ]}
              >
                <sphereGeometry
                  args={[
                    point.id === selectedLandmarkId ? 0.002 : 0.001,
                    16,
                    16,
                  ]}
                />
                <meshStandardMaterial
                  color={point.id === selectedLandmarkId ? 'yellow' : 'red'}
                />
              </mesh>
            ),
        )}
      </group>
    </Bvh>
  )
}
