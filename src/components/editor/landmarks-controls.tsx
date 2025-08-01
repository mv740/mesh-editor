import { Trash2 } from 'lucide-react'
import { useHotkeys } from 'react-hotkeys-hook'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { SelectedPoint } from './type'

type LandmarksControlsProps = {
  selectedPoints: SelectedPoint[]
  setSelectedPoints: (points: SelectedPoint[]) => void
  selectedLandmarkId: number | null
  setSelectedLandmarkId: (id: number | null) => void
}

export const LandmarksControls = ({
  selectedPoints,
  setSelectedPoints,
  selectedLandmarkId,
  setSelectedLandmarkId,
}: LandmarksControlsProps) => {
  useHotkeys('delete', () => {
    if (selectedLandmarkId !== null) {
      setSelectedPoints(
        selectedPoints.filter((point) => point.id !== selectedLandmarkId),
      )
      setSelectedLandmarkId(null)
    }
  })

  useHotkeys('esc', () => {
    setSelectedLandmarkId(null)
  })

  const handleRowClick = (pointId: number) => {
    if (selectedLandmarkId === pointId) {
      setSelectedLandmarkId(null)
    } else {
      setSelectedLandmarkId(pointId)
    }
  }

  const handleDelete = (pointId: number, event: React.MouseEvent) => {
    event.stopPropagation() // Prevent row click when delete button is clicked
    const updatedPoints = selectedPoints.filter((point) => point.id !== pointId)
    setSelectedPoints(updatedPoints)

    // Clear selection if deleted point was selected
    if (selectedLandmarkId === pointId) {
      setSelectedLandmarkId(null)
    }
  }

  return (
    <Card className="w-full max-w-xs sm:min-w-[350px] h-[200px] md:h-[300px] lg:h-[450px]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle data-testid="landmark-control-title">
            Landmark Controls
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col p-4 overflow-hidden">
        <div className="mb-4 text-sm text-muted-foreground text-center font-medium">
          Click on a landmark to select it. Use the delete button to remove
          selected landmarks. Click on a row to select a landmark.
        </div>

        <ScrollArea className="flex-1 min-h-24" type="auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-16 text-center">ID</TableHead>
                <TableHead className="w-16 text-center">X</TableHead>
                <TableHead className="w-16 text-center">Y</TableHead>
                <TableHead className="w-16 text-center">Z</TableHead>
                <TableHead className="w-[50px] text-center">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selectedPoints.map((point) => (
                <TableRow
                  key={point.id}
                  className={`cursor-pointer hover:bg-muted/50 ${
                    selectedLandmarkId === point.id ? 'bg-muted' : ''
                  }`}
                  onClick={() => handleRowClick(point.id)}
                >
                  <TableCell className="w-16 font-medium text-center">
                    {point.id}
                  </TableCell>
                  <TableCell className="w-16 text-center">
                    {point.position.x.toFixed(2)}
                  </TableCell>
                  <TableCell className="w-16 text-center">
                    {point.position.y.toFixed(2)}
                  </TableCell>
                  <TableCell className="w-16 text-center">
                    {point.position.z.toFixed(2)}
                  </TableCell>
                  <TableCell className="">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleDelete(point.id, e)}
                      className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {selectedPoints.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground"
                  >
                    No landmarks selected
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
