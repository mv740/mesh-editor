import { ArcballControls, GizmoHelper, GizmoViewport } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Button } from '../ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../ui/card'
import { LandmarksControls } from './controls/landmarks-controls'
import { MeshHistoryControls } from './controls/mesh-history-controls'
import { TransformControls } from './controls/transform-controls'
import { ViewControls } from './controls/view-controls'
import { GeometryModel } from './geometry-model'
import { useMeshHistory } from './history/mesh-history-provider'
import { exportMesh } from './utils/geometry-utils'
import type { EditorState, SelectedPoint } from './type'
import type { Scene, Vector3 } from 'three'

interface InputSettings {
  file: File
}

export interface MeshEditorProps {
  title?: string
  description?: string
  actionLabel?: string
  inputSettings?: InputSettings
  footer?: React.ReactNode
  onLandmarksChange?: (landmarks: SelectedPoint[]) => void
}

export function MeshEditorInner({
  title = 'Mesh Editor',
  description = 'Edit your mesh',
  actionLabel,
  inputSettings,
  footer,
  onLandmarksChange,
}: MeshEditorProps) {
  // Mesh history provider
  const { currentState, addToHistory, canUndo, undo, canRedo, redo } =
    useMeshHistory()

  const sceneRef = useRef<Scene | null>(null)

  const [editorState, setEditorState] = useState<EditorState>('view')
  const [fileObjectPath, setFileObjectPath] = useState<string | null>(null)

  useHotkeys('ctrl+z', () => {
    // Undo last action
    if (canUndo) {
      undo()
    }
  })
  useHotkeys('ctrl+y', () => {
    // Redo last action
    if (canRedo) {
      redo()
    }
  })

  useEffect(() => {
    if (inputSettings?.file) {
      const objectFile = URL.createObjectURL(inputSettings?.file)
      setFileObjectPath(objectFile)
    }
  }, [inputSettings?.file])

  // Mesh
  const [wireframeVisible, setWireframeVisible] = useState<boolean>(false)
  const [opacity, setOpacity] = useState<number>(1)

  const nextPointId = useRef(1)
  const [selectedLandmarkId, setSelectedLandmarkId] = useState<number | null>(
    null,
  )
  const [landmarksVisible, setLandmarksVisible] = useState<boolean>(true)
  const [landmarksLabelsVisible, setLandmarksLabelsVisible] =
    useState<boolean>(true)

  // Call onLandmarksChange whenever selectedPoints changes
  useEffect(() => {
    if (onLandmarksChange && currentState.selectedPoints) {
      onLandmarksChange(currentState.selectedPoints)
    }
  }, [currentState.selectedPoints, onLandmarksChange])

  const handlePointSelect = (
    position: Vector3,
    normal: Vector3,
    landmarkIdToMove?: number,
  ) => {
    let updatedPoints
    if (landmarkIdToMove) {
      updatedPoints = currentState.selectedPoints.map((point) => {
        if (point.id === landmarkIdToMove) {
          return { ...point, position, normal }
        }
        return point
      })
    } else {
      const newPoint: SelectedPoint = {
        position,
        normal,
        id: nextPointId.current++,
      }
      updatedPoints = [...currentState.selectedPoints, newPoint]
    }
    addToHistory(
      {
        selectedPoints: updatedPoints,
        meshGeometry: currentState.meshGeometry,
      },
      landmarkIdToMove ? 'movePoint' : 'addPoint',
      landmarkIdToMove ? 'Moved landmark' : 'Added landmark',
    )
  }

  const toggleEditorOptions: Array<{
    value: EditorState
    label: string
    ariaLabel: string
    testId: string
  }> = [
    {
      value: 'view',
      label: 'Viewer',
      ariaLabel: 'Toggle view',
      testId: 'toggle-view',
    },
    {
      value: 'landmarks',
      label: 'Landmarks',
      ariaLabel: 'Toggle landmarks',
      testId: 'toggle-landmarks',
    },
    {
      value: 'transforms',
      label: 'Transforms',
      ariaLabel: 'Toggle transforms',
      testId: 'toggle-transforms',
    },
  ]

  const [meshOutlineVisible, setMeshOutlineVisible] = useState<boolean>(true)

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
                onValueChange={(value: EditorState) => {
                  if (value) {
                    setEditorState(value)
                  }
                }}
              >
                {toggleEditorOptions.map((item) => (
                  <ToggleGroupItem
                    key={item.value}
                    variant="outline"
                    value={item.value}
                    aria-label={item.ariaLabel}
                    className="px-6 py-2"
                    data-testid={item.testId}
                  >
                    {item.label}
                  </ToggleGroupItem>
                ))}
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
              <div className="pointer-events-auto h-fit">
                <LandmarksControls
                  selectedPoints={currentState.selectedPoints}
                  setSelectedPoints={(updatedPoints) => {
                    addToHistory(
                      {
                        selectedPoints: updatedPoints,
                        meshGeometry: currentState.meshGeometry,
                      },
                      'deletePoint',
                      'Deleted landmark',
                    )
                  }}
                  selectedLandmarkId={selectedLandmarkId}
                  setSelectedLandmarkId={setSelectedLandmarkId}
                />
              </div>
            )}
            {editorState === 'transforms' && (
              <div className="pointer-events-auto h-fit">
                <TransformControls
                  meshOutlineVisible={meshOutlineVisible}
                  setMeshOutlineVisible={setMeshOutlineVisible}
                />
              </div>
            )}
            <div className="pointer-events-auto ml-auto h-fit">
              <div className="flex flex-col gap-2">
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
                <MeshHistoryControls />
              </div>
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
              gl={{ antialias: true, localClippingEnabled: true }}
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
                      selectedPoints={currentState.selectedPoints}
                      onPointSelect={handlePointSelect}
                      selectedLandmarkId={selectedLandmarkId}
                      setSelectedLandmarkId={setSelectedLandmarkId}
                      landmarksVisible={landmarksVisible}
                      wireframeVisible={wireframeVisible}
                      meshOpacity={opacity}
                      landmarkLabelsVisible={landmarksLabelsVisible}
                      meshOutlineVisible={meshOutlineVisible}
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
