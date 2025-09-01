import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dropzone,
  DropzoneDescription,
  DropzoneGroup,
  DropzoneInput,
  DropzoneTitle,
  DropzoneUploadIcon,
  DropzoneZone,
} from '@/components/ui/dropzone'
import { MeshEditor } from '@/mesh-editor'

export function App() {
  const [files, setFiles] = useState<File[]>([])
  const [loadMeshEditor, setLoadMeshEditor] = useState(false)

  const loadFile = async () => {
    try {
      // Fetch the file from the public assets
      const response = await fetch('./assets/bunny.bin.stl')
      const arrayBuffer = await response.arrayBuffer()

      // Create a proper File object with the actual file data
      const file = new File([arrayBuffer], 'bunny.bin.stl', {
        type: 'application/octet-stream', // STL files are binary
      })

      setFiles([file])
    } catch (error) {
      console.error('Failed to load STL file:', error)
    }
  }

  if (loadMeshEditor) {
    return (
      <>
        <div className="h-screen dark bg-gray-600">
          <MeshEditor title="Mesh Editor" inputSettings={{ file: files[0] }} />
        </div>
      </>
    )
  }

  return (
    <>
      <div className="h-screen dark bg-gray-600">
        <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
          <div className="w-full max-w-sm">
            <Card>
              <CardHeader>
                <CardTitle>Mesh Editor</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Dropzone
                      multiple={false}
                      accept={{ 'model/stl': ['.stl'] }}
                      onDropAccepted={setFiles}
                    >
                      <DropzoneZone>
                        <DropzoneInput />
                        <DropzoneGroup className="gap-4">
                          <DropzoneUploadIcon />
                          <DropzoneGroup>
                            <DropzoneTitle>
                              Drop files here or click to upload
                            </DropzoneTitle>
                            <DropzoneDescription>
                              Supported formats: STL
                            </DropzoneDescription>
                          </DropzoneGroup>
                        </DropzoneGroup>
                      </DropzoneZone>
                    </Dropzone>
                  </div>
                </div>
                <div className="m-2">
                  {files.length === 0 && (
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={loadFile}
                    >
                      Load demo file
                    </Button>
                  )}
                </div>
                {files.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <ul className="list-disc list-inside text-sm text-muted-foreground">
                      {files.map((file) => (
                        <Card key={file.name}>
                          <CardHeader>
                            <CardTitle>{file.name}</CardTitle>
                            <CardDescription>
                              File Size: {(file.size / 1024).toFixed(2)} KB
                            </CardDescription>
                          </CardHeader>
                        </Card>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex">
                <Button
                  onClick={() => setLoadMeshEditor(true)}
                  disabled={files.length === 0}
                  variant="outline"
                  className="w-full"
                >
                  Open
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}
