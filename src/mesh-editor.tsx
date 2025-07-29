import { ArcballControls, GizmoHelper, GizmoViewport } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import React, { Suspense, useEffect, useRef, useState } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { exportMesh } from './components/editor/geometry-utils'
import { LandmarksControls } from './components/editor/landmarks-controls'
import { ViewControls } from './components/editor/view-controls'
import { Button } from './components/ui/button'
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
import type { Scene, Vector3 } from 'three'

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
  const sceneRef = useRef<Scene | null>(null)

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

  const handlePointSelect = (
    position: Vector3,
    normal: Vector3,
    landmarkIdToMove?: number,
  ) => {
    if (landmarkIdToMove) {
      const updatedPoints = selectedPoints.map((point) => {
        if (point.id === landmarkIdToMove) {
          return { ...point, position, normal }
        }
        return point
      })
      setSelectedPoints(updatedPoints)
      return
    }

    const newPoint: SelectedPoint = {
      position,
      normal,
      id: nextPointId.current++,
    }
    setSelectedPoints((prevPoints) => [...prevPoints, newPoint])
  }

  return (
    <Card className="dark h-full flex-1 rounded-lg overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between relative">
          {/* Left side - Title, Description, Action */}
          <div className="flex flex-col flex-1">
            <CardTitle data-testid="card-title">{title}</CardTitle>
            <CardDescription data-testid="card-description">
              {description}
            </CardDescription>
            <CardAction>{actionLabel}</CardAction>
          </div>

          {/* Center - ToggleGroup absolutely centered */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div className="pointer-events-auto">
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
          </div>

          {/* Right side - Export button */}
          <div className="flex items-center">
            <Button
              variant="success"
              data-testid="export-button"
              onClick={() => exportMesh(sceneRef, opacity)}
            >
              Export
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col relative min-h-0">
        <div className="relative w-full flex-1 rounded-lg overflow-hidden min-h-0">
          {/* Overlay for controls */}
          <div className="absolute inset-0 w-full h-full flex flex-wrap z-10 pointer-events-none justify-between p-3">
            {editorState === 'landmarks' && (
              <div className="pointer-events-auto">
                <LandmarksControls
                  selectedPoints={selectedPoints}
                  setSelectedPoints={setSelectedPoints}
                  selectedLandmarkId={selectedLandmarkId}
                  setSelectedLandmarkId={setSelectedLandmarkId}
                />
              </div>
            )}
            <div className="pointer-events-auto ml-auto">
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
            </div>
          </div>
          {/* Canvas fills the rest */}
          <div className="w-full h-full flex-1 min-h-0">
            <Canvas
              shadows
              onCreated={({ scene }) => {
                sceneRef.current = scene
              }}
              style={{ background: '#1a1a1a  ' }}
              data-testid="canvas"
              camera={{
                position: [0, 0, 5],
                fov: 50,
                near: 0.001,
                far: 1000,
              }}
              gl={{ antialias: true }}
            >
              <Suspense fallback={null}>
                {fileObjectPath && (
                  <>
                    <ambientLight intensity={0.2} />
                    <directionalLight position={[0, 10, 10]} intensity={0.7} />
                    <directionalLight
                      position={[0, -10, -10]}
                      intensity={0.5}
                    />

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
