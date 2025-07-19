import { Minimize2Icon, SettingsIcon } from 'lucide-react'
import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

type ViewControlsProps = {
  wireframeVisible: boolean
  setWireframeVisible: (visible: boolean) => void
  opacity: number
  setOpacity: (opacity: number) => void
  landmarksVisible: boolean
  setLandmarksVisible: (visible: boolean) => void
}

/**
 * Renders view controls for adjusting wireframe visibility, opacity, and landmarks.
 *
 * @component
 * @param {object} props - The component props
 * @param {boolean} props.wireframeVisible - Indicates whether wireframe is currently visible
 * @param {Function} props.setWireframeVisible - Callback to toggle wireframe visibility
 * @param {number} props.opacity - Current opacity value (0-1)
 * @param {Function} props.setOpacity - Callback to update opacity value
 * @param {boolean} props.landmarksVisible - Indicates whether landmarks are currently visible
 * @param {Function} props.setLandmarksVisible - Callback to toggle landmarks visibility
 * @returns {React.ReactElement} A card with switches and slider for view control settings
 */
export const ViewControls = ({
  wireframeVisible,
  setWireframeVisible,
  opacity,
  setOpacity,
  landmarksVisible,
  setLandmarksVisible,
}: ViewControlsProps) => {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!isExpanded) {
    console.log('not expanded')
    return (
      <Button
        variant="secondary"
        size="icon"
        className="size-10"
        onClick={() => setIsExpanded(true)}
        style={{
          bottom: 20,
          right: 20,
          zIndex: 10,
          position: 'absolute',
        }}
      >
        <SettingsIcon />
      </Button>
    )
  }
  console.log('expanded')

  return (
    <Card
      className="absolute"
      style={{
        top: 20,
        right: 20,
        zIndex: 10,
        minWidth: '300px',
      }}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle data-testid="view-control-title">View Controls</CardTitle>
          <Button
            variant=""
            size="icon"
            className="size-6"
            onClick={() => setIsExpanded(false)}
          >
            <Minimize2Icon />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="wireframe">Wireframe:</Label>
            <Switch
              id="wireframe"
              checked={wireframeVisible}
              onCheckedChange={setWireframeVisible}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="opacity">Opacity:</Label>
            <Slider
              id="opacity"
              min={0}
              max={1}
              step={0.01}
              value={[opacity]}
              onValueChange={([value]) => setOpacity(value)}
              about="opacity"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="landmarks">Landmarks:</Label>
            <Switch
              id="landmarks"
              checked={landmarksVisible}
              onCheckedChange={setLandmarksVisible}
            />
          </div>
        </div>{' '}
      </CardContent>
    </Card>
  )
}
