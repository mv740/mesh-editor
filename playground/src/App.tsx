import { useEffect, useState } from 'react'
import { MeshEditor } from '../../src'

export function App() {
  const [inputFile, setInputFile] = useState<File | null>(null)

  useEffect(() => {
    const loadFile = async () => {
      try {
        // Fetch the file from the public assets
        const response = await fetch('./assets/bunny.bin.stl')
        const arrayBuffer = await response.arrayBuffer()

        // Create a proper File object with the actual file data
        const file = new File([arrayBuffer], 'bunny.bin.stl', {
          type: 'application/octet-stream', // STL files are binary
        })

        setInputFile(file)
      } catch (error) {
        console.error('Failed to load STL file:', error)
      }
    }

    loadFile()
  }, [])

  if (!inputFile) {
    return <div className="m-8">Loading...</div>
  }

  return (
    <div className="h-screen p-8">
      <MeshEditor
        title="Mesh Editor"
        description="InputDescription"
        inputSettings={{ file: inputFile }}
      />
    </div>
  )
}
