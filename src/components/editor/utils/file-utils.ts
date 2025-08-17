import { saveAs } from 'file-saver'

/**
 * Saves a file using the provided Blob and filename.
 *
 * @param blob The Blob object to be saved
 * @param filename The name of the file to be saved
 */
export const saveFile = (blob: Blob, filename: string) => {
  saveAs(blob, filename)
}
