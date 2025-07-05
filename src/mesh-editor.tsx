import React from 'react'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './components/ui/card'

export const meshEditorProps = {
  title: 'Mesh Editor',
  description: 'Edit your mesh',
}

interface MeshEditorProps {
  title?: string
  description?: string
  actionLabel?: string
  content?: React.ReactNode
  footer?: React.ReactNode
}

export function MeshEditor({
  title = meshEditorProps.title,
  description = meshEditorProps.description,
  actionLabel = 'Action',
  content = 'Card Content',
  footer = 'Card Footer',
}: MeshEditorProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="card-title">{title}</CardTitle>
        <CardDescription data-testid="card-description">
          {description}
        </CardDescription>
        <CardAction>{actionLabel}</CardAction>
      </CardHeader>
      <CardContent>
        {typeof content === 'string' ? <p>{content}</p> : content}
      </CardContent>
      <CardFooter>
        {typeof footer === 'string' ? <p>{footer}</p> : footer}
      </CardFooter>
    </Card>
  )
}
