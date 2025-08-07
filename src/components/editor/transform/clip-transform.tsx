import { Helper, TransformControls } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  Box3,
  BoxHelper,
  BufferAttribute,
  DoubleSide,
  Plane,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Mesh,
} from 'three'
import { useMeshHistory } from '../history/mesh-history-provider'
import type { TransformControls as TreeTransformControls } from 'three/addons/controls/TransformControls.js'
// Helper: get intersection polygon between box and plane
// Robust box-plane intersection: returns convex polygon of intersection points
const getBoxPlaneIntersectionPolygon = (box: Box3, plane: Plane): Vector3[] => {
  // 8 corners
  const corners = [
    new Vector3(box.min.x, box.min.y, box.min.z),
    new Vector3(box.min.x, box.min.y, box.max.z),
    new Vector3(box.min.x, box.max.y, box.min.z),
    new Vector3(box.min.x, box.max.y, box.max.z),
    new Vector3(box.max.x, box.min.y, box.min.z),
    new Vector3(box.max.x, box.min.y, box.max.z),
    new Vector3(box.max.x, box.max.y, box.min.z),
    new Vector3(box.max.x, box.max.y, box.max.z),
  ]
  // 12 edges (pairs of indices)
  const edges = [
    [0, 1],
    [0, 2],
    [0, 4],
    [1, 3],
    [1, 5],
    [2, 3],
    [2, 6],
    [3, 7],
    [4, 5],
    [4, 6],
    [5, 7],
    [6, 7],
  ]
  const intersectionPoints: Vector3[] = []
  for (const [i0, i1] of edges) {
    const p0 = corners[i0]
    const p1 = corners[i1]
    const d0 = plane.distanceToPoint(p0)
    const d1 = plane.distanceToPoint(p1)
    // If edge crosses plane
    if ((d0 < 0 && d1 > 0) || (d0 > 0 && d1 < 0)) {
      const t = d0 / (d0 - d1)
      const ip = p0.clone().lerp(p1, t)
      intersectionPoints.push(ip)
    } else if (Math.abs(d0) < 1e-6 && Math.abs(d1) < 1e-6) {
      // Edge lies on plane
      intersectionPoints.push(p0.clone(), p1.clone())
    } else if (Math.abs(d0) < 1e-6) {
      intersectionPoints.push(p0.clone())
    } else if (Math.abs(d1) < 1e-6) {
      intersectionPoints.push(p1.clone())
    }
  }
  // Remove duplicates robustly
  const unique: Vector3[] = []
  for (const p of intersectionPoints) {
    let found = false
    for (const q of unique) {
      if (p.distanceTo(q) < 1e-6) {
        found = true
        break
      }
    }
    if (!found) unique.push(p)
  }
  if (unique.length < 3) return []
  // Sort points in plane
  const normal = plane.normal.clone().normalize()
  const center = unique
    .reduce((acc, v) => acc.add(v), new Vector3())
    .multiplyScalar(1 / unique.length)
  // Find axes in plane
  const arbitrary =
    Math.abs(normal.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)
  const axis1 = new Vector3().crossVectors(normal, arbitrary).normalize()
  const axis2 = new Vector3().crossVectors(normal, axis1).normalize()
  unique.sort((a, b) => {
    const va = a.clone().sub(center)
    const vb = b.clone().sub(center)
    const angleA = Math.atan2(va.dot(axis2), va.dot(axis1))
    const angleB = Math.atan2(vb.dot(axis2), vb.dot(axis1))
    return angleA - angleB
  })
  return unique
}

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
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate'>(
    'translate',
  )
  // Clip plane
  const [clipPlane, setClipPlane] = useState(new Plane(new Vector3(0, 0, 1), 0))
  const clipPlaneRef = useRef<Mesh | null>(null)
  const { addToHistory, currentState, currentIndex } = useMeshHistory()

  const prevIndexRef = useRef(currentIndex)
  useEffect(() => {
    // Only update mesh from history if currentIndex changed due to undo/redo, not after new state is added
    if (
      currentState.clipPlane &&
      clipPlaneRef.current &&
      prevIndexRef.current !== currentIndex &&
      transformRef.current &&
      transformRef.current.object
    ) {
      // move visible plane mesh to match history state
      clipPlane.normal.copy(currentState.clipPlane.normal)
      clipPlane.constant = currentState.clipPlane.constant

      // Set mesh position and orientation from history
      const normal = currentState.clipPlane.normal
      const constant = currentState.clipPlane.constant
      const position = normal.clone().multiplyScalar(-constant)
      transformRef.current.object.position.copy(position)
      transformRef.current.object.quaternion.setFromUnitVectors(
        new Vector3(0, 0, 1),
        normal,
      )
    }
    prevIndexRef.current = currentIndex
  }, [currentIndex, currentState.clipPlane])

  // Compute the orientation for the blue plane to match the clipPlane
  const boundingBox = useMemo(() => {
    if (meshRef.current) {
      return new Box3().setFromObject(meshRef.current)
    }
    return null
  }, [meshRef])

  // Use a ref for plane position to avoid unnecessary re-renders
  const planePositionRef = useRef<Vector3>(new Vector3(0, 0, 0))

  useFrame(() => {
    let dragCenter: Vector3
    if (clipPlaneRef.current) {
      dragCenter = new Vector3()
      clipPlaneRef.current.getWorldPosition(dragCenter)
      planePositionRef.current.copy(dragCenter)
    } else if (boundingBox) {
      dragCenter = new Vector3()
      boundingBox.getCenter(dragCenter)
      planePositionRef.current.copy(dragCenter)
    }
  })

  const onControlsMouseUp = useCallback(() => {
    if (transformRef.current && clipPlaneRef.current) {
      // Apply the transformation
      const dragCenter = new Vector3()
      clipPlaneRef.current.getWorldPosition(dragCenter)
      addToHistory(
        {
          selectedPoints: [...currentState.selectedPoints],
          meshGeometry: currentState.meshGeometry,
          clipPlane: clipPlane.clone(),
        },
        'moveClipPlane',
        'Move clipping plane',
      )
      // Update the clipPlane state
    }
  }, [clipPlane, addToHistory, currentState])

  // Update the clipping plane constant when the plane mesh moves
  const handleTransformChange = () => {
    if (clipPlaneRef.current) {
      const p = new Vector3()
      clipPlaneRef.current.getWorldPosition(p)
      if (transformMode === 'rotate') {
        // Get the mesh's world quaternion
        const q = new Quaternion()
        clipPlaneRef.current.getWorldQuaternion(q)
        // Apply quaternion to default normal (0,0,1)
        const newNormal = new Vector3(0, 0, 1).applyQuaternion(q).normalize()
        clipPlane.normal.copy(newNormal)
        clipPlane.constant = -p.dot(newNormal)
      } else {
        // Translate mode: just update constant
        clipPlane.constant = -p.dot(clipPlane.normal)
      }
    }
  }

  const handleCanvasRightClick = (event: MouseEvent) => {
    event.preventDefault()
    // Toggle transformMode between 'rotate' and 'translate'
    setTransformMode((prev) => (prev === 'translate' ? 'rotate' : 'translate'))
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
  }, [clipPlane, gl.domElement])

  // arrow point the clipped side
  const transformRef = useRef<TreeTransformControls | null>(null)
  // Attach clamping to TransformControls' internal object
  const handleTransformRef = useCallback(
    (control: TreeTransformControls | null) => {
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

  // Use ref for slice polygon and geometry for dynamic mesh
  const slicePolygonRef = useRef<Vector3[]>([])
  // Only useRef for intersection polygon
  const intersectionGeometryRef = useRef<BufferGeometry>(null)
  // Separate geometry for outline
  const intersectionOutlineGeometryRef = useRef<BufferGeometry>(null)

  // Ref for intersection debug spheres
  // const intersectionSpheresRef = useRef<(Mesh | null)[]>([])

  useFrame(() => {
    if (boundingBox) {
      const newPolygon = getBoxPlaneIntersectionPolygon(boundingBox, clipPlane)
      slicePolygonRef.current = newPolygon
      // Update intersection debug spheres positions
      // DEBUGGING ONLY: Uncomment to visualize intersection points
      // intersectionSpheresRef.current.forEach((sphere, idx) => {
      //   if (sphere && newPolygon[idx]) {
      //     sphere.position.copy(newPolygon[idx])
      //   }
      // })

      // Update intersection mesh geometry
      if (intersectionGeometryRef.current) {
        if (newPolygon.length >= 3) {
          const vertices = new Float32Array(
            newPolygon.flatMap((v) => v.toArray()),
          )
          const indices = new Uint16Array(
            Array.from({ length: newPolygon.length - 2 }, (_, i) => [
              0,
              i + 1,
              i + 2,
            ]).flat(),
          )
          intersectionGeometryRef.current.setAttribute(
            'position',
            new BufferAttribute(vertices, 3),
          )
          intersectionGeometryRef.current.setIndex(
            new BufferAttribute(indices, 1),
          )
          intersectionGeometryRef.current.computeVertexNormals()
        } else {
          intersectionGeometryRef.current.setAttribute(
            'position',
            new BufferAttribute(new Float32Array([]), 3),
          )
          intersectionGeometryRef.current.setIndex(null)
        }
        intersectionGeometryRef.current.attributes.position.needsUpdate = true
        if (intersectionGeometryRef.current.index)
          intersectionGeometryRef.current.index.needsUpdate = true
      }
      // Update outline geometry
      if (intersectionOutlineGeometryRef.current) {
        if (newPolygon.length > 1) {
          const outlineVertices = new Float32Array(
            newPolygon.flatMap((v) => v.toArray()),
          )
          intersectionOutlineGeometryRef.current.setAttribute(
            'position',
            new BufferAttribute(outlineVertices, 3),
          )
        } else {
          intersectionOutlineGeometryRef.current.setAttribute(
            'position',
            new BufferAttribute(new Float32Array([]), 3),
          )
        }
        intersectionOutlineGeometryRef.current.attributes.position.needsUpdate = true
      }
    } else {
      slicePolygonRef.current = []
      if (intersectionGeometryRef.current) {
        intersectionGeometryRef.current.setAttribute(
          'position',
          new BufferAttribute(new Float32Array([]), 3),
        )
        intersectionGeometryRef.current.setIndex(null)
        intersectionGeometryRef.current.attributes.position.needsUpdate = true
      }
    }
  })
  // ...existing code...

  return (
    <>
      <ambientLight intensity={1} />
      <directionalLight position={[0, 10, 10]} intensity={0.8} />
      {/* Debug: show bounding box corners as spheres */}
      {/* {boundingBox &&
        [
          new Vector3(boundingBox.min.x, boundingBox.min.y, boundingBox.min.z),
          new Vector3(boundingBox.min.x, boundingBox.min.y, boundingBox.max.z),
          new Vector3(boundingBox.min.x, boundingBox.max.y, boundingBox.min.z),
          new Vector3(boundingBox.min.x, boundingBox.max.y, boundingBox.max.z),
          new Vector3(boundingBox.max.x, boundingBox.min.y, boundingBox.min.z),
          new Vector3(boundingBox.max.x, boundingBox.min.y, boundingBox.max.z),
          new Vector3(boundingBox.max.x, boundingBox.max.y, boundingBox.min.z),
          new Vector3(boundingBox.max.x, boundingBox.max.y, boundingBox.max.z),
        ].map((corner, idx) => (
          <mesh key={`corner-${idx}`} position={corner.toArray()}>
            <sphereGeometry args={[0.005, 16, 16]} />
            <meshBasicMaterial color="yellow" />
          </mesh>
        ))} */}

      {/* Debug: show intersection points as magenta spheres (Three.js refs, not React state) */}
      {/* {slicePolygonRef.current.map((pt, idx) => (
        <mesh
          key={`intersect-${idx}`}
          ref={(el) => (intersectionSpheresRef.current[idx] = el)}
          position={pt.toArray()}
        >
          <sphereGeometry args={[0.005, 16, 16]} />
          <meshBasicMaterial
            color="magenta"
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      ))} */}

      {/* Dynamic intersection polygon mesh using geometryRef */}
      <mesh>
        <bufferGeometry ref={intersectionGeometryRef} />
        <meshBasicMaterial
          color="blue"
          opacity={0.2}
          transparent
          side={DoubleSide}
        />
        {/* Outline for intersection polygon */}
        <lineLoop>
          <bufferGeometry ref={intersectionOutlineGeometryRef} />
          <lineBasicMaterial color="royalblue" linewidth={2} />
        </lineLoop>
      </mesh>
      {/* The mesh to be transformed */}

      <TransformControls
        ref={handleTransformRef}
        mode={transformMode}
        onObjectChange={handleTransformChange}
        onMouseUp={onControlsMouseUp}
      >
        {/* Invisible plane mesh for interaction */}
        <mesh ref={clipPlaneRef} position={[0, 0, 0]}>
          <planeGeometry args={[0.15, 0.15]} />
          <meshBasicMaterial opacity={0} transparent color={'red'} />
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
