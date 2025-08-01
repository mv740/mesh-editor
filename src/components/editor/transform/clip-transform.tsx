import { Helper, TransformControls } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box3,
  BoxHelper,
  DoubleSide,
  Plane,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Mesh,
} from 'three'

type ClipTransformComponentProps = {
  geometry: BufferGeometry
  meshRef: React.RefObject<Mesh | null>
  wireframe: boolean
  opacity: number
  color: string
  handleMeshClick: (event: ThreeEvent<MouseEvent>) => void
  meshOutlineVisible?: boolean
}

export const ClipTransformComponent = ({
  geometry,
  meshRef,
  wireframe,
  opacity,
  color,
  handleMeshClick,
  meshOutlineVisible,
}: ClipTransformComponentProps) => {
  const { gl } = useThree()
  // Clip plane
  const [clipPlane, setClipPlane] = useState(new Plane(new Vector3(0, 0, 1), 0))
  const clipPlaneRef = useRef<Mesh | null>(null)

  // State for the plane mesh position (TransformControls target) and a key to force re-attach
  const [transformKey, setTransformKey] = useState(0)

  // Compute the orientation for the blue plane to match the clipPlane

  const planeQuaternion = useMemo(() => {
    const defaultNormal = new Vector3(0, 0, 1)
    const quat = new Quaternion()
    quat.setFromUnitVectors(defaultNormal, clipPlane.normal)
    return quat
  }, [clipPlane])

  const boundingBox = useMemo(() => {
    if (meshRef.current) {
      return new Box3().setFromObject(meshRef.current)
    }
    return null
  }, [meshRef])

  // Always center the plane mesh at the bounding box center
  const planePosition = useMemo(() => {
    if (!boundingBox) return new Vector3(0, 0, 0)
    const center = new Vector3()
    boundingBox.getCenter(center)
    return center
  }, [boundingBox])

  // Update the clipping plane constant when the plane mesh moves
  const handleTransformChange = () => {
    if (clipPlaneRef.current) {
      const p = new Vector3()
      clipPlaneRef.current.getWorldPosition(p)
      clipPlane.constant = -p.dot(clipPlane.normal)
    }
  }

  const handleCanvasRightClick = (event: MouseEvent) => {
    event.preventDefault()
    if (!boundingBox) return
    // cycle normal axis, preserving the sign of the normal
    const currentNormal = clipPlane.normal
    const sign =
      Math.sign(currentNormal.x + currentNormal.y + currentNormal.z) || 1
    let newNormal = new Vector3(0, 0, sign)
    if (Math.abs(currentNormal.z) === 1) {
      newNormal = new Vector3(sign, 0, 0)
    } else if (Math.abs(currentNormal.x) === 1) {
      newNormal = new Vector3(0, sign, 0)
    }
    // Center of the mesh's bounding box
    const center = new Vector3()
    boundingBox.getCenter(center)
    // Calculate new constant so the new plane passes through the center
    const newConstant = -center.dot(newNormal)
    setClipPlane(new Plane(newNormal, newConstant))
    setTransformKey((k) => k + 1)
  }

  const handleCanvasMiddleClick = (event: MouseEvent) => {
    if (event.button === 1) {
      event.preventDefault()
      setClipPlane((prevPlane) => {
        const newNormal = prevPlane.normal.clone().negate()
        const position = new Vector3()
        clipPlaneRef.current?.getWorldPosition(position)
        const newConstant = -position.dot(newNormal)
        return new Plane(newNormal, newConstant)
      })
    }
  }

  useEffect(() => {
    // right click
    gl.domElement.addEventListener('contextmenu', handleCanvasRightClick)
    // middle click
    gl.domElement.addEventListener('mousedown', handleCanvasMiddleClick)
    return () => {
      gl.domElement.removeEventListener('contextmenu', handleCanvasRightClick)
      gl.domElement.removeEventListener('mousedown', handleCanvasMiddleClick)
    }
  }, [clipPlane, setClipPlane, gl.domElement])

  // Determine which axis to show based on the current clipPlane normal
  const absNormal = clipPlane.normal
    .clone()
    .set(
      Math.abs(clipPlane.normal.x),
      Math.abs(clipPlane.normal.y),
      Math.abs(clipPlane.normal.z),
    )
  const showX = absNormal.x === 1
  const showY = absNormal.y === 1
  const showZ = absNormal.z === 1

  // arrow point the clipped side
  const transformRef = useRef(null)
  // Attach clamping to TransformControls' internal object
  const handleTransformRef = useCallback(
    (control: any) => {
      if (!control) return
      transformRef.current = control
      control.addEventListener('change', () => {
        if (control.object && boundingBox) {
          control.object.position.clamp(boundingBox.min, boundingBox.max)
        }
      })
    },
    [boundingBox],
  )

  // Compute plane size to fit the bounding box projection onto the plane
  const planeSize = useMemo(() => {
    if (!boundingBox) return [0.25, 0.25]
    const min = boundingBox.min
    const max = boundingBox.max
    const normal = clipPlane.normal.clone().normalize()
    // X-aligned (red): plane's local X is Z, local Y is Y
    if (Math.abs(normal.x) === 1 && normal.y === 0 && normal.z === 0) {
      return [Math.max(0.01, max.z - min.z), Math.max(0.01, max.y - min.y)]
    }
    // Y-aligned (green): plane's local X is X, local Y is Z
    if (normal.x === 0 && Math.abs(normal.y) === 1 && normal.z === 0) {
      return [Math.max(0.01, max.x - min.x), Math.max(0.01, max.z - min.z)]
    }
    // Z-aligned (blue): plane's local X is X, local Y is Y
    if (normal.x === 0 && normal.y === 0 && Math.abs(normal.z) === 1) {
      return [Math.max(0.01, max.x - min.x), Math.max(0.01, max.y - min.y)]
    }
    // Default case, fallback to a small size
    return [0.25, 0.25]
  }, [boundingBox, clipPlane])

  return (
    <>
      {/* The mesh to be transformed */}
      <ambientLight intensity={1} />
      <directionalLight position={[0, 10, 10]} intensity={0.8} />
      <TransformControls
        ref={handleTransformRef}
        key={transformKey}
        mode="translate"
        showX={showX}
        showY={showY}
        showZ={showZ}
        onObjectChange={handleTransformChange}
      >
        <>
          <mesh
            ref={clipPlaneRef}
            position={planePosition}
            quaternion={planeQuaternion}
          >
            <planeGeometry args={[planeSize[0], planeSize[1]]} />
            <meshBasicMaterial
              color="blue"
              opacity={0.1}
              transparent={true}
              side={DoubleSide}
            />
          </mesh>
        </>
      </TransformControls>

      {/* The actual mesh with clipping applied */}
      <mesh name="inputMesh" ref={meshRef} onDoubleClick={handleMeshClick}>
        <primitive object={geometry} attach="geometry" />
        <meshStandardMaterial
          wireframe={wireframe}
          transparent={true}
          opacity={opacity}
          color={color}
          clippingPlanes={[clipPlane]}
        />

        {meshOutlineVisible && <Helper type={BoxHelper} args={['royalblue']} />}
      </mesh>
      {/* Wireframe mesh without clipping planes */}
      <mesh name="wireframe">
        <primitive object={geometry.clone()} attach="geometry" />
        <meshBasicMaterial
          wireframe={true}
          transparent={true}
          opacity={0.01}
          depthWrite={false}
          color={'grey'}
          side={DoubleSide}
        />
      </mesh>
    </>
  )
}
