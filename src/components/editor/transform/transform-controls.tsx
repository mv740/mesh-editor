import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'

export const TransformControls = () => {
  return (
    <Card className="w-full max-w-xs sm:min-w-[350px] h-[200px] md:h-[300px] lg:h-[450px]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle data-testid="landmark-control-title">
            Transform Controls
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col p-4 overflow-hidden"></CardContent>
    </Card>
  )
}
