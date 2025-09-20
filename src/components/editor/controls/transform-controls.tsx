import { Bandage, Box, Info, Loader2, Scissors } from 'lucide-react'
import { useState } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  type LineSegments,
} from 'three'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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

  const [isComputing, setIsComputing] = useState(false)

  // Per-feature settings (separate settings for clip, fill hole, etc.)
  const [showFillSettings, setShowFillSettings] = useState(false)
  const [fillSteinerDensity, setFillSteinerDensity] = useState<number>(0.8)
  const [fillMaxHoleArea, setFillMaxHoleArea] = useState<number | undefined>(
    0.05,
  )
  const [fillDebugOnlyBoundary, setFillDebugOnlyBoundary] =
    useState<boolean>(false)
  const [fillSplitAngleDeg, setFillSplitAngleDeg] = useState<number>(30)
  const [fillWeldEnabled, setFillWeldEnabled] = useState<boolean>(true)
  const [fillWeldTolerance, setFillWeldTolerance] = useState<number>(1e-6)

  // remesh settings
  const [showRemeshSettings, setShowRemeshSettings] = useState(false)
  const [remeshMode, setRemeshMode] = useState<'3' | '6'>('3') // '3' for isotropic, '6' for anisotropic

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
    <>
      {/* Dialog shown when worker is computing */}
      <Dialog open={isComputing} onOpenChange={setIsComputing}>
        <DialogContent
          onPointerDownOutside={(e) => e.preventDefault()}
          showCloseButton={false}
          className="flex flex-col items-center justify-center gap-4 py-8"
        >
          <Loader2 className="h-16 w-16 text-primary animate-spin mb-2" />
          <DialogTitle className="text-2xl font-semibold text-center">
            Processing...
          </DialogTitle>
          <DialogDescription className="text-center text-base text-muted-foreground">
            Please wait while the mesh is being processed.
            <br />
            This may take a few seconds.
          </DialogDescription>
        </DialogContent>
      </Dialog>
      <Card className="w-full max-w-xs sm:min-w-[350px] h-[200px] md:h-[300px] lg:h-[650px]">
        <CardHeader>
          <CardTitle data-testid="landmark-control-title">
            Transform Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col p-4 overflow-hidden">
          <div className="mb-4 text-sm text-muted-foreground text-center font-medium">
            Use right-click to switch the gizmo mode (Translate or Rotate).
          </div>
          <ScrollArea className="flex-1 min-h-24 gap-2" type="auto">
            <div className="flex flex-col gap-2">
              <Card>
                <CardHeader>
                  <CardTitle>Clipping</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="mesh-outline-labels">
                      Mesh Outline Labels:
                    </Label>
                    <Switch
                      id="mesh-outline-labels"
                      checked={meshOutlineVisible}
                      onCheckedChange={setMeshOutlineVisible}
                    />
                  </div>
                  <div className="flex flex-col gap-3 mt-4">
                    <Button
                      variant="default"
                      onClick={() => {
                        if (
                          currentState.clipPlane &&
                          currentState.meshGeometry
                        ) {
                          const currentStateLandmarks =
                            currentState.selectedPoints
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
                            executeClip(
                              currentState,
                              currentState.selectedPoints,
                            )
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
                              const removedIds = pendingSelection.removed.map(
                                (p) => p.id,
                              )
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
                            pendingSelection?.kept ??
                            currentState.selectedPoints
                          executeClip(currentState, pts)
                        }
                        // clear pending state
                        setPendingSelection(null)
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
              {/* Fill hole settings */}
              <Card className="">
                <CardHeader>
                  <CardTitle>Fill hole settings</CardTitle>
                  <CardAction>
                    <Switch
                      id="show-fill-settings"
                      checked={showFillSettings}
                      onCheckedChange={(v) => setShowFillSettings(Boolean(v))}
                    />
                  </CardAction>
                </CardHeader>
                <CardContent>
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
                            setFillSteinerDensity(
                              Number.parseFloat(e.target.value),
                            )
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
                          onCheckedChange={(v) =>
                            setFillWeldEnabled(Boolean(v))
                          }
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
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant="default"
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
                          true, // disable laplacian smoothing for now (can distort the mesh
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
                </CardFooter>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Remesh (experimental)</CardTitle>
                  <CardAction>
                    <Switch
                      id="show-remesh-settings"
                      checked={showRemeshSettings}
                      onCheckedChange={(v) => setShowRemeshSettings(Boolean(v))}
                    />
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="text-sm text-muted-foreground">
                    Remesh the current mesh using isotropic remeshing. This may
                    take a while for large meshes.
                  </div>
                  {showRemeshSettings && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2 ">
                        <Label htmlFor="remesh-mode" className="sr-only">
                          Mode:
                        </Label>
                        <Select
                          value={remeshMode}
                          onValueChange={(v) => setRemeshMode(v as '3' | '6')}
                        >
                          <SelectTrigger
                            id="remesh-mode"
                            size="sm"
                            className="justify-start capitalize shadow-none"
                          >
                            <SelectValue placeholder="Mode" />
                            <span className="font-medium">Mode:</span>
                            <SelectValue placeholder="Select a mode" />
                          </SelectTrigger>
                          <SelectContent align="end">
                            <SelectItem value="3">isotropic</SelectItem>
                            <SelectItem value="6">anisotropic</SelectItem>
                          </SelectContent>
                        </Select>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="link">
                              <Info />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              <b>Isotropic:</b> evenly sized, well-shaped
                              (near-equilateral) triangles
                            </p>
                            <p>
                              <b>Anisotropic:</b> triangles aligned with
                              geometric features
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  )}
                </CardContent>

                <CardFooter>
                  <Button
                    className="w-full"
                    variant="default"
                    onClick={() => {
                      if (currentState.meshGeometry) {
                        setIsComputing(true)
                        const geometry = currentState.meshGeometry.clone()
                        // vertices
                        const vertices = geometry.getAttribute('position').array
                        // indices
                        const indices = geometry.index
                          ? geometry.index.array
                          : []

                        const worker = new Worker(
                          new URL(
                            '@/components/editor/utils/remesh-worker.ts?worker',
                            import.meta.url,
                          ),
                          { type: 'module' },
                        )
                        worker.postMessage({
                          positions: new Float32Array(vertices),
                          indices: new Uint32Array(indices),
                          options: {
                            remeshDim: Number(remeshMode), // 3 for isotropic, 6 for anisotropic
                          },
                        })
                        // eslint-disable-next-line unicorn/prefer-add-event-listener
                        worker.onmessage = (event) => {
                          console.log('Message from worker', event.data)
                          const { positions, indices } = event.data

                          const geometry = new BufferGeometry()
                          geometry.setAttribute(
                            'position',
                            new BufferAttribute(new Float32Array(positions), 3),
                          )
                          geometry.setIndex(
                            new BufferAttribute(new Uint32Array(indices), 1),
                          )
                          geometry.computeVertexNormals()
                          addToHistory(
                            {
                              ...currentState,
                              meshGeometry: geometry,

                              clipPlane: currentState.clipPlane,
                            },
                            'remeshTransform',
                            'Applied remeshing transform',
                          )
                          setIsComputing(false)
                          worker.terminate()
                        }
                        worker.onerror = () => {
                          setIsComputing(false)
                          worker.terminate()
                        }
                      }
                    }}
                  >
                    <Box /> Apply Remesh
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </>
  )
}
