import { ArcballControls, GizmoHelper, GizmoViewport } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import React, { Suspense, useEffect, useRef, useState } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { LandmarksControls } from './components/editor/landmarks-controls'
import { ViewControls } from './components/editor/view-controls'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './components/ui/card'
import { GeometryModel, type SelectedPoint } from './geometry-model'
import type { Vector3 } from 'three'

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

export type EditorState = 'view' | 'landmarks'

export function MeshEditor({
  title = 'Mesh Editor',
  description = 'Edit your mesh',
  actionLabel,
  inputSettings,
  footer,
}: MeshEditorProps) {
  const [editorState, setEditorState] = React.useState<EditorState>('view')
  const [fileObjectPath, setFileObjectPath] = React.useState<string | null>(
    null,
  )

  useEffect(() => {
    if (inputSettings?.file) {
      const objectFile = URL.createObjectURL(inputSettings?.file)
      setFileObjectPath(objectFile)
    }
  }, [inputSettings?.file])

  // Mesh
  const [wireframeVisible, setWireframeVisible] = useState<boolean>(false)
  const [opacity, setOpacity] = useState<number>(1)

  // Landmarks
  const nextPointId = useRef(1)
  const [selectedPoints, setSelectedPoints] = useState<SelectedPoint[]>([])
  const [selectedLandmarkId, setSelectedLandmarkId] = useState<number | null>(
    null,
  )
  const [landmarksVisible, setLandmarksVisible] = useState<boolean>(true)
  const [landmarksLabelsVisible, setLandmarksLabelsVisible] =
    useState<boolean>(true)

  const handlePointSelect = (position: Vector3, normal: Vector3) => {
    const newPoint: SelectedPoint = {
      position,
      normal,
      id: nextPointId.current++,
    }
    setSelectedPoints((prevPoints) => [...prevPoints, newPoint])
  }

  return (
    <Card className="dark">
      <CardHeader>
        <div className="flex items-center justify-between">
          {/* Left side - Title, Description, Action */}
          <div className="flex flex-col flex-1">
            <CardTitle data-testid="card-title">{title}</CardTitle>
            <CardDescription data-testid="card-description">
              {description}
            </CardDescription>
            <CardAction>{actionLabel}</CardAction>
          </div>

          {/* Center - ToggleGroup */}
          <div className="flex justify-center flex-1">
            <ToggleGroup
              type="single"
              value={editorState}
              onValueChange={(value) => setEditorState(value as EditorState)}
            >
              <ToggleGroupItem
                variant="outline"
                value="view"
                aria-label="Toggle view"
                className="px-6 py-2"
                data-testid="toggle-view"
              >
                Viewer
              </ToggleGroupItem>
              <ToggleGroupItem
                variant="outline"
                value="landmarks"
                aria-label="Toggle landmarks"
                className="px-6 py-2"
                data-testid="toggle-landmarks"
              >
                Landmarks
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Right side - Empty spacer for balance */}
          <div className="flex-1"></div>
        </div>
      </CardHeader>

      <CardContent className="h-[900px] ">
        <div className="w-full h-full rounded-lg overflow-hidden relative">
          {editorState === 'landmarks' && (
            <LandmarksControls
              selectedPoints={selectedPoints}
              setSelectedPoints={setSelectedPoints}
              selectedLandmarkId={selectedLandmarkId}
              setSelectedLandmarkId={setSelectedLandmarkId}
            />
          )}
          <ViewControls
            landmarksVisible={landmarksVisible}
            setLandmarksVisible={setLandmarksVisible}
            opacity={opacity}
            setOpacity={setOpacity}
            setWireframeVisible={setWireframeVisible}
            wireframeVisible={wireframeVisible}
            landmarkLabelsVisible={landmarksLabelsVisible}
            setLandmarkLabelsVisible={setLandmarksLabelsVisible}
          />
          <Canvas
            style={{ background: '#e0e0e0' }}
            data-testid="canvas"
            camera={{
              position: [0, 0, 5],
              fov: 50,
              near: 0.00001,
              far: 10000,
            }}
          >
            <Suspense fallback={null}>
              {fileObjectPath && (
                <>
                  <directionalLight position={[0, 10, 0]} intensity={1} />
                  <GeometryModel
                    stlUrl={fileObjectPath}
                    editorState={editorState}
                    selectedPoints={selectedPoints}
                    onPointSelect={handlePointSelect}
                    selectedLandmarkId={selectedLandmarkId}
                    setSelectedLandmarkId={setSelectedLandmarkId}
                    landmarksVisible={landmarksVisible}
                    wireframeVisible={wireframeVisible}
                    meshOpacity={opacity}
                    landmarkLabelsVisible={landmarksLabelsVisible}
                  />
                  <GizmoHelper alignment="bottom-left" margin={[80, 80]}>
                    <GizmoViewport
                      axisColors={['#ff3653', '#8adb00', '#2c8fff']}
                      labelColor="black"
                    />
                  </GizmoHelper>
                </>
              )}
            </Suspense>
            <ArcballControls
              minDistance={0.001}
              maxDistance={1000}
              enableGrid={true}
              adjustNearFar={true}
              makeDefault
            />
          </Canvas>
        </div>
      </CardContent>

      {footer && (
        <>
          <CardFooter className="flex flex-col gap-4">
            {typeof footer === 'string' ? <p>{footer}</p> : footer}
          </CardFooter>
        </>
      )}
    </Card>
  )
}
