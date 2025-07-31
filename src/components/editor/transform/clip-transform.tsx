import { TransformControls } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DoubleSide,
  Plane,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Mesh,
} from 'three'

export const ClipTransformComponent = ({
  geometry,
  meshRef,
  wireframe,
  opacity,
  color,
  handleMeshClick,
}: {
  geometry: BufferGeometry
  meshRef: React.RefObject<Mesh | null>
  wireframe: boolean
  opacity: number
  color: string
  handleMeshClick: (event: ThreeEvent<MouseEvent>) => void
}) => {
  const { gl } = useThree()
  // Clip plane
  const [clipPlane, setClipPlane] = useState(new Plane(new Vector3(0, 0, 1), 0))
  const clipPlaneRef = useRef<Mesh | null>(null)

  // Compute the position and orientation for the blue plane to match the clipPlane
  const planePosition = useMemo(() => {
    return clipPlane.normal.clone().multiplyScalar(-clipPlane.constant)
  }, [clipPlane])

  const planeQuaternion = useMemo(() => {
    const defaultNormal = new Vector3(0, 0, 1)
    const quat = new Quaternion()
    quat.setFromUnitVectors(defaultNormal, clipPlane.normal)
    return quat
  }, [clipPlane])

  // Add a direct event handler for the TransformControls
  // and update the clipping plane
  // internal position would be always 0,0,0
  const handleTransformChange = () => {
    const p = new Vector3()
    if (clipPlaneRef.current) {
      clipPlaneRef.current.getWorldPosition(p)
      clipPlane.constant = -p.dot(clipPlane.normal)
    }
  }

  const handleCanvasRightClick = (event: MouseEvent) => {
    event.preventDefault()
    if (setClipPlane) {
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
      // Find a point on the current plane
      const pointOnPlane = currentNormal
        .clone()
        .multiplyScalar(-clipPlane.constant)
      // Calculate new constant so the new plane passes through the same point
      const newConstant = -pointOnPlane.dot(newNormal)
      setClipPlane(new Plane(newNormal, newConstant))
    }
  }

  const handleCanvasMiddleClick = (event: MouseEvent) => {
    if (event.button === 1) {
      event.preventDefault()
      setClipPlane((prevPlane) => {
        return new Plane(prevPlane.normal.clone().negate(), -prevPlane.constant)
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

  return (
    <>
      {/* Visualize the clipping plane */}
      {/* <planeHelper args={[clipPlane, 1, 0xff0000]} /> */}

      {/* The mesh to be transformed */}
      <ambientLight intensity={0.2} />
      <directionalLight position={[0, 10, 10]} intensity={0.7} />
      <TransformControls
        mode="translate"
        onObjectChange={handleTransformChange}
        matrixAutoUpdate={true}
      >
        <mesh
          ref={clipPlaneRef}
          position={planePosition}
          quaternion={planeQuaternion}
        >
          <planeGeometry args={[0.5, 0.5]} />
          <meshBasicMaterial
            color="blue"
            opacity={0.1}
            transparent={true}
            side={DoubleSide}
          />
        </mesh>
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
