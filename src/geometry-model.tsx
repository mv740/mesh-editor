import { useLoader, useThree } from '@react-three/fiber'
import React, { useEffect, useRef } from 'react'
import { Vector3, type Mesh } from 'three'
import { STLLoader } from 'three/examples/jsm/Addons.js'

interface GeometryModelProps {
  stlUrl: string
  onLoad?: () => void
}

export const GeometryModel = ({ stlUrl, onLoad }: GeometryModelProps) => {
  const geometry = useLoader(STLLoader, stlUrl)
  const meshRef = useRef<Mesh>(null)

  const { camera, gl } = useThree()

  const initialCameraSetupRef = useRef(false)

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
    <mesh name="inputMesh" ref={meshRef}>
      <primitive object={geometry} attach="geometry" />
      <meshPhongMaterial transparent={true} visible={true} />
    </mesh>
  )
}
