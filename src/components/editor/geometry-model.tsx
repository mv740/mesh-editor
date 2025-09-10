import { Bvh } from '@react-three/drei'
import { useLoader, useThree, type ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useRef } from 'react'
import {
  DoubleSide,
  type Mesh,
  type PerspectiveCamera,
  type Vector3,
} from 'three'
import { STLLoader } from 'three/examples/jsm/Addons.js'
import { useMeshHistory } from './history/mesh-history-provider'
import { ClipTransformComponent } from './transform/clip-transform'
import { LandmarkWithLabel, SegmentLine2 } from './utils/geometry-utils'
import type { EditorState, MeshViewType, SelectedPoint } from './type'

interface GeometryModelProps {
  stlUrl: string
  viewType: MeshViewType
  onLoad?: () => void
  onPointSelect?: (
    point: Vector3,
    normal: Vector3,
    landmarkIdToMove?: number,
  ) => void
  setSelectedLandmarkId?: (id: number | null) => void
  selectedPoints?: SelectedPoint[]
  editorState?: EditorState
  selectedLandmarkId?: number | null
  landmarksVisible?: boolean
  meshOpacity?: number
  landmarkLabelsVisible?: boolean
  meshOutlineVisible?: boolean
  holesVisible?: boolean
}

export const GeometryModel = ({
  stlUrl,
  viewType,
  onLoad,
  onPointSelect,
  editorState,
  selectedPoints = [],
  landmarksVisible = true,
  selectedLandmarkId,
  setSelectedLandmarkId,
  meshOpacity = 1,
  landmarkLabelsVisible = true,
  meshOutlineVisible = true,
  holesVisible = true,
}: GeometryModelProps) => {
  const geometry = useLoader(STLLoader, stlUrl)
  const meshRef = useRef<Mesh>(null)

  // add mesh to history
  const { addToHistory, currentState } = useMeshHistory()
  useEffect(() => {
    if (meshRef.current) {
      addToHistory(
        {
          ...currentState,
          selectedPoints: [...selectedPoints],
          meshGeometry: geometry,
        },
        'initialize',
        'loaded mesh',
      )
    }
  }, [geometry, meshRef])

  useEffect(() => {
    // load mesh from state if available
    if (currentState?.meshGeometry && meshRef.current) {
      meshRef.current.geometry = currentState.meshGeometry
    }
  }, [currentState?.meshGeometry, meshRef])

  const { camera, gl } = useThree()

  const initialCameraSetupRef = useRef(false)

  const mouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // Pointer move effect here (only once for the whole geometry/model)
  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      mouse.current = {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
      }
    },
    [gl.domElement],
  )

  useEffect(() => {
    if (!gl.domElement) return
    gl.domElement.addEventListener('pointermove', handlePointerMove)
    return () => {
      gl.domElement.removeEventListener('pointermove', handlePointerMove)
    }
  }, [gl.domElement, handlePointerMove])

  // Handle clicks on the mesh
  const handleMeshClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()

    // If the mesh has a BVH, use it for faster raycasting
    if (meshRef.current && meshRef.current.geometry.boundsTree) {
      // The point and normal are already calculated by R3F and available in the event
      const point = event.point.clone()
      const normal = event.face?.normal.clone() || event.normal?.clone()

      if (onPointSelect && normal) {
        onPointSelect(point, normal, selectedLandmarkId || undefined)
      }
    }

    return true
  }
  const currentMesh = currentState?.meshGeometry ?? geometry

  const meshComponent = (
    <Bvh name="bvh-group">
      <mesh
        name="inputMesh"
        ref={meshRef}
        onDoubleClick={
          editorState === 'landmarks' ? handleMeshClick : undefined
        }
      >
        <primitive object={currentMesh} attach="geometry" />
        {viewType !== 'normals' ? (
          <meshPhongMaterial
            transparent={true}
            visible={true}
            opacity={meshOpacity}
            // wireframe={wireframeVisible}
            wireframe={viewType === 'wireframe'}
          />
        ) : (
          <meshNormalMaterial />
        )}
      </mesh>
    </Bvh>
  )

  useEffect(() => {
    if (meshRef.current && !initialCameraSetupRef.current) {
      meshRef.current.geometry.center()

      // Get bounding sphere
      meshRef.current.geometry.computeBoundingSphere()
      const sphere = meshRef.current.geometry.boundingSphere
      if (sphere) {
        const { radius } = sphere
        // Get camera parameters
        const perspectiveCamera = camera as PerspectiveCamera
        const fov = perspectiveCamera.fov * (Math.PI / 180) // vertical fov in radians
        const aspect = perspectiveCamera.aspect

        // Calculate distance for vertical fit
        const verticalDist = radius / Math.sin(fov / 2)
        // Calculate distance for horizontal fit
        const horizontalFov = 2 * Math.atan(Math.tan(fov / 2) * aspect)
        const horizontalDist = radius / Math.sin(horizontalFov / 2)

        // Use the larger distance to ensure the model fits both vertically and horizontally
        const distance = Math.max(verticalDist, horizontalDist)

        meshRef.current.position.set(
          -sphere.center.x,
          -sphere.center.y,
          -sphere.center.z,
        )
        camera.position.set(0, 0, distance * 1.1) // 1.1 for padding
        camera.lookAt(0, 0, 0)
        camera.updateProjectionMatrix()
      }

      initialCameraSetupRef.current = true
      if (onLoad) {
        onLoad()
      }
    }
  }, [geometry, camera, onLoad])

  return (
    <>
      {editorState === 'transforms' ? (
        <ClipTransformComponent
          geometry={currentMesh}
          viewType={viewType}
          meshRef={meshRef}
          opacity={meshOpacity}
          color={'grey'}
          meshOutlineVisible={meshOutlineVisible}
        />
      ) : (
        meshComponent
      )}

      {holesVisible && currentState.filledHolesGeometry?.boundaryEdgesMesh && (
        <group name="boundary-edges" renderOrder={10}>
          <SegmentLine2
            geometry={currentState.filledHolesGeometry?.boundaryEdgesMesh}
            name="boundary-edges"
            linewidth={4}
          />
          {/* Render triangulated filled holes if available */}
          {currentState.filledHolesGeometry?.triangulatedFilledHoleMesh && (
            <mesh
              renderOrder={10}
              geometry={
                currentState.filledHolesGeometry?.triangulatedFilledHoleMesh
              }
            >
              <meshPhongMaterial
                transparent={false}
                visible={true}
                opacity={1}
                color={'orange'}
                wireframe={true}
                side={DoubleSide}
              />
            </mesh>
          )}
        </group>
      )}
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
    </>
  )
}
