import { Bvh } from '@react-three/drei'
import { useLoader, useThree, type ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useRef } from 'react'
import { STLLoader } from 'three/examples/jsm/Addons.js'
import { ClipTransformComponent } from './transform/clip-transform'
import { LandmarkWithLabel } from './utils/geometry-utils'
import type { EditorState, SelectedPoint } from './type'
import type { Mesh, PerspectiveCamera, Vector3 } from 'three'

interface GeometryModelProps {
  stlUrl: string
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
  wireframeVisible?: boolean
  landmarkLabelsVisible?: boolean
  meshOutlineVisible?: boolean
}

export const GeometryModel = ({
  stlUrl,
  onLoad,
  onPointSelect,
  editorState,
  selectedPoints = [],
  landmarksVisible = true,
  selectedLandmarkId,
  setSelectedLandmarkId,
  meshOpacity = 1,
  wireframeVisible = false,
  landmarkLabelsVisible = true,
  meshOutlineVisible = true,
}: GeometryModelProps) => {
  const geometry = useLoader(STLLoader, stlUrl)
  const meshRef = useRef<Mesh>(null)

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

  // // Clip plane options
  // const [invertClipPlane, setInvertClipPlane] = useState<boolean>(false)
  // // Clip plane
  // const [clipPlane, setClipPlane] = useState(new Plane(new Vector3(0, 0, 1), 0))
  // const clipPlaneRef = useRef<Mesh | null>(null)

  // TODO: Handle the clip plane changes
  // right double click to invert the clip plane
  // right click to change the plane axis (x => y => z)
  const meshComponent = (
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
          geometry={geometry}
          meshRef={meshRef}
          wireframe={wireframeVisible}
          opacity={meshOpacity}
          color={'grey'}
          meshOutlineVisible={meshOutlineVisible}
          handleMeshClick={function (event: ThreeEvent<MouseEvent>): void {
            throw new Error('Function not implemented.')
          }}
        />
      ) : (
        meshComponent
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
