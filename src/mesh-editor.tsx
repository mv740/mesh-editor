import { ArcballControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import React, { Suspense, useEffect } from 'react'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './components/ui/card'
import { GeometryModel } from './geometry-model'
export const meshEditorProps = {
  title: 'Mesh Editor',
  description: 'Edit your mesh',
}

interface InputSettings {
  file: File
}

interface MeshEditorProps {
  title?: string
  description?: string
  actionLabel?: string
  inputSettings?: InputSettings
  footer?: React.ReactNode
}

export function MeshEditor({
  title = meshEditorProps.title,
  description = meshEditorProps.description,
  actionLabel,
  inputSettings,
  footer,
}: MeshEditorProps) {
  const [fileObjectPath, setFileObjectPath] = React.useState<string | null>(
    null,
  )

  useEffect(() => {
    if (inputSettings?.file) {
      const objectFile = URL.createObjectURL(inputSettings?.file)

      setFileObjectPath(objectFile)
    }
  }, [inputSettings?.file])

  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="card-title">{title}</CardTitle>
        <CardDescription data-testid="card-description">
          {description}
        </CardDescription>
        <CardAction>{actionLabel}</CardAction>
      </CardHeader>
      {/* TODO: able to dynamically change the canvas size */}
      <CardContent className="h-[900px]">
        <Canvas
          data-testid="canvas"
          camera={{
            position: [0, 0, 5],
            fov: 50,
            near: 0.00001, // Extremely small near plane
            far: 10000, // Very large far plane
          }}
        >
          <Suspense fallback={null}>
            {fileObjectPath && (
              <>
                {/* Top light */}
                <directionalLight position={[0, 10, 0]} intensity={1} />
                <GeometryModel stlUrl={fileObjectPath} />
              </>
            )}
          </Suspense>
          <ArcballControls
            // ref={arcballRef}
            minDistance={0.001}
            maxDistance={1000}
            enableGrid={true}
            adjustNearFar={true}
            makeDefault
          />
        </Canvas>
      </CardContent>
      {footer && (
        <CardFooter>
          {typeof footer === 'string' ? <p>{footer}</p> : footer}
        </CardFooter>
      )}
    </Card>
  )
}
