import { HistoryIcon, Minimize2Icon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
import { useMeshHistory } from '../history/mesh-history-provider'

export const MeshHistoryControls = () => {
  const { history, currentIndex, jumpToHistory, undo, redo, canUndo, canRedo } =
    useMeshHistory()

  const [isExpanded, setIsExpanded] = useState(false)
  const isViewingPreviousState =
    history.length > 1 && currentIndex < history.length - 1

  const activeRowRef = useRef<HTMLTableRowElement>(null)

  useEffect(() => {
    if (activeRowRef.current) {
      activeRowRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, [currentIndex])

  if (!isExpanded) {
    return (
      <Button
        size="icon"
        className="size-10 absolute  right-5 bottom-20 z-50"
        onClick={() => setIsExpanded(true)}
      >
        <HistoryIcon className="size-5" />
      </Button>
    )
  }

  return (
    <Card className="w-full max-w-xs sm:min-w-[350px] h-[200px] md:h-[300px] lg:h-[450px]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle data-testid="mesh-history-title">Mesh History</CardTitle>
          <div className="flex gap-2">
            <Button
              size="icon"
              className="size-6"
              onClick={() => setIsExpanded(false)}
            >
              <Minimize2Icon />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col p-4 overflow-hidden">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Button
            size="sm"
            variant="outline"
            disabled={!canUndo}
            onClick={undo}
          >
            Undo
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canRedo}
            onClick={redo}
          >
            Redo
          </Button>
        </div>
        {isViewingPreviousState && (
          <div className="mb-2 text-xs text-orange-600 text-center font-semibold">
            You are viewing a previous state. If you make a change now, all
            future actions will be deleted.
          </div>
        )}
        <div className="mb-4 text-sm text-muted-foreground text-center font-medium">
          Click on a history entry to preview that mesh state.
        </div>
        <ScrollArea className="flex-1 min-h-24" type="auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-16 text-center">#</TableHead>
                {/* <TableHead className="w-32 text-center">Action</TableHead> */}
                <TableHead className="w-32 text-center">Description</TableHead>
                <TableHead className="w-32 text-center">Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...history].reverse().map((entry, idx) => {
                const isActive = currentIndex === history.length - 1 - idx
                return (
                  <TableRow
                    key={idx}
                    ref={isActive ? activeRowRef : undefined}
                    className={`cursor-pointer hover:bg-muted/50 ${isActive ? 'bg-muted' : ''}`}
                    onClick={() => jumpToHistory(history.length - 1 - idx)}
                  >
                    <TableCell className="w-16 font-medium text-center">
                      {history.length - idx}
                    </TableCell>
                    {/* <TableCell className="w-32 text-center">
                      {entry.actionType}
                    </TableCell> */}
                    <TableCell className="w-32 text-center">
                      {entry.description || '-'}
                    </TableCell>
                    <TableCell className="w-32 text-center">
                      {entry.timestamp.toLocaleString() || '-'}
                    </TableCell>
                  </TableRow>
                )
              })}
              {history.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center text-muted-foreground"
                  >
                    No history yet
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
