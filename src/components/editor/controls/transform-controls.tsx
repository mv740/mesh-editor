import { Bandage, Scissors } from 'lucide-react'
import { useState } from 'react'
import { Mesh, MeshBasicMaterial, type LineSegments } from 'three'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import {
  useMeshHistory,
  type MeshState,
} from '../history/mesh-history-provider'
import { optimizedBvhClip, partitionPointsByPlane } from '../utils/clip'
import {
  createBoundaryEdgesMesh,
  fillGeometryHoles,
} from '../utils/fille-holes'
import type { SelectedPoint } from '../type'
import { ConfirmDialog } from './dialog/confirm-dialog'

type TransformControlsProps = {
  meshOutlineVisible: boolean
  setMeshOutlineVisible: (visible: boolean) => void
}

export const TransformControls = ({
  meshOutlineVisible,
  setMeshOutlineVisible,
}: TransformControlsProps) => {
  const [openConfirmDialog, setOpenConfirmDialog] = useState(false)
  const [pendingSelection, setPendingSelection] = useState<{
    kept: SelectedPoint[]
    removed: SelectedPoint[]
  } | null>(null)

  // Per-feature settings (separate settings for clip, fill hole, etc.)
  const [showFillSettings, setShowFillSettings] = useState(false)
  const [fillSteinerDensity, setFillSteinerDensity] = useState<number>(0.5)
  const [fillMaxHoleArea, setFillMaxHoleArea] = useState<number | undefined>(
    0.05,
  )
  const [fillDebugOnlyBoundary, setFillDebugOnlyBoundary] =
    useState<boolean>(false)
  const [fillSplitAngleDeg, setFillSplitAngleDeg] = useState<number>(30)
  const [fillWeldEnabled, setFillWeldEnabled] = useState<boolean>(true)
  const [fillWeldTolerance, setFillWeldTolerance] = useState<number>(1e-6)

  const { addToHistory, currentState } = useMeshHistory()

  const executeClip = (
    currentState: MeshState,
    selectedPoints: SelectedPoint[],
  ) => {
    const mesh = new Mesh(currentState.meshGeometry, new MeshBasicMaterial())
    const meshClipped = optimizedBvhClip(mesh, currentState.clipPlane!, true)
    addToHistory(
      {
        ...currentState,
        meshGeometry: meshClipped.geometry,
        clipPlane: currentState.clipPlane,
        selectedPoints,
      },
      'clipTransform',
      'Applied clipping transform',
    )
  }

  return (
    <Card className="w-full max-w-xs sm:min-w-[350px] h-[200px] md:h-[300px] lg:h-[450px]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle data-testid="landmark-control-title">
            Transform Controls
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col p-4 overflow-hidden">
        <div className="flex items-center gap-2">
          <Label htmlFor="mesh-outline-labels">Mesh Outline Labels:</Label>
          <Switch
            id="mesh-outline-labels"
            checked={meshOutlineVisible}
            onCheckedChange={setMeshOutlineVisible}
          />
        </div>
        <div className="flex flex-col gap-3 mt-4">
          <Button
            variant="outline"
            onClick={() => {
              if (currentState.clipPlane && currentState.meshGeometry) {
                const currentStateLandmarks = currentState.selectedPoints
                if (currentStateLandmarks.length > 0) {
                  const { kept, removed } = partitionPointsByPlane(
                    currentStateLandmarks,
                    (lm) => lm.position, // extract Vector3 from a landmark object
                    currentState.clipPlane,
                  )

                  if (removed.length > 0) {
                    // store the kept + removed landmarks while the user confirms
                    setPendingSelection({ kept, removed })
                    setOpenConfirmDialog(true)
                  } else {
                    // No removals -> perform clip immediately with kept landmarks
                    executeClip(currentState, kept)
                  }
                } else {
                  executeClip(currentState, currentState.selectedPoints)
                }
              }
            }}
          >
            <Scissors /> Apply Clip
          </Button>
          <ConfirmDialog
            open={openConfirmDialog}
            onOpenChange={(v) => setOpenConfirmDialog(v)}
            title="Are you sure you want to proceed?"
            description=""
            content={
              pendingSelection && pendingSelection.removed.length > 0
                ? (() => {
                    const removedIds = pendingSelection.removed.map((p) => p.id)
                    const preview = removedIds.slice(0, 8).join(', ')
                    const count = removedIds.length
                    return (
                      <>
                        <div className="space-y-2">
                          <div>
                            {`This action will remove ${count} selected landmark${
                              count === 1 ? '' : 's'
                            }`}
                          </div>
                          <div>
                            {`Removed IDs: ${preview}${removedIds.length > 8 ? ', …' : ''}`}
                          </div>
                        </div>
                      </>
                    )
                  })()
                : 'This action will remove some selected landmarks. '
            }
            confirmLabel="Confirm"
            confirmVariant="destructive"
            cancelLabel="Cancel"
            cancelVariant="default"
            onAction={(result) => {
              if (result) {
                const pts =
                  pendingSelection?.kept ?? currentState.selectedPoints
                executeClip(currentState, pts)
              }
              // clear pending state
              setPendingSelection(null)
            }}
          />
          {/* Fill hole settings */}
          <ScrollArea className="flex-1 min-h-24" type="auto">
            <div className="mt-3 p-3 border rounded-md bg-muted/5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="show-fill-settings">Fill hole settings</Label>
                </div>
                <Switch
                  id="show-fill-settings"
                  checked={showFillSettings}
                  onCheckedChange={(v) => setShowFillSettings(Boolean(v))}
                />
              </div>
              {showFillSettings && (
                <div className="flex flex-col gap-3">
                  <div>
                    <Label htmlFor="steiner-density">
                      Steiner density: {fillSteinerDensity}
                    </Label>
                    <input
                      id="steiner-density"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={String(fillSteinerDensity)}
                      onChange={(e) =>
                        setFillSteinerDensity(Number.parseFloat(e.target.value))
                      }
                      className="w-full"
                    />
                  </div>
                  <div>
                    <Label htmlFor="max-hole-area">
                      Max hole area (projected):
                    </Label>
                    <input
                      id="max-hole-area"
                      type="number"
                      step={0.001}
                      min={0}
                      value={
                        fillMaxHoleArea === undefined
                          ? ''
                          : String(fillMaxHoleArea)
                      }
                      onChange={(e) => {
                        const v = e.target.value
                        setFillMaxHoleArea(v === '' ? undefined : Number(v))
                      }}
                      className="w-full rounded border px-2 py-1"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="debug-only-boundary">
                      Debug: only detect boundary
                    </Label>
                    <Switch
                      id="debug-only-boundary"
                      checked={fillDebugOnlyBoundary}
                      onCheckedChange={(v) =>
                        setFillDebugOnlyBoundary(Boolean(v))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="split-angle">
                      Sharp split angle (deg): {fillSplitAngleDeg}
                    </Label>
                    <input
                      id="split-angle"
                      type="range"
                      min={0}
                      max={180}
                      step={1}
                      value={String(fillSplitAngleDeg)}
                      onChange={(e) =>
                        setFillSplitAngleDeg(Number(e.target.value))
                      }
                      className="w-full"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="weld-enabled">
                      Weld vertices after merge
                    </Label>
                    <Switch
                      id="weld-enabled"
                      checked={fillWeldEnabled}
                      onCheckedChange={(v) => setFillWeldEnabled(Boolean(v))}
                    />
                  </div>
                  {fillWeldEnabled && (
                    <div>
                      <Label htmlFor="weld-tol">
                        Weld tolerance: {fillWeldTolerance}
                      </Label>
                      <input
                        id="weld-tol"
                        type="number"
                        step={1e-7}
                        min={1e-9}
                        value={String(fillWeldTolerance)}
                        onChange={(e) =>
                          setFillWeldTolerance(Number(e.target.value))
                        }
                        className="w-full rounded border px-2 py-1"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          <Button
            variant="outline"
            onClick={() => {
              if (currentState.meshGeometry) {
                const geometry = currentState.meshGeometry.clone()

                // test - use per-feature settings
                const fillTest = fillGeometryHoles(
                  geometry,
                  1e-5, // tolerance
                  fillSteinerDensity,
                  fillMaxHoleArea,
                  fillDebugOnlyBoundary,
                  fillSplitAngleDeg,
                  fillWeldEnabled ? fillWeldTolerance : 0,
                )
                let edgeMesh: LineSegments | undefined
                if (fillTest?.boundaryResult) {
                  edgeMesh = createBoundaryEdgesMesh(
                    fillTest?.boundaryResult,
                    'red',
                  )
                }

                addToHistory(
                  {
                    ...currentState,
                    meshGeometry: fillTest.output,
                    filledHolesGeometry: {
                      triangulatedFilledHoleMesh: fillTest
                        ? fillTest.triangulatedFilledHoleMesh
                        : undefined,
                      boundaryEdgesMesh: edgeMesh
                        ? edgeMesh.geometry
                        : undefined,
                    },

                    clipPlane: currentState.clipPlane,
                  },
                  'fillHoleTransform',
                  fillTest?.boundaryResult
                    ? 'Applied fill hole transform'
                    : 'No boundary edges found',
                )
              }
            }}
          >
            <Bandage /> Apply Fill hole
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
