import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Button } from '../src'

test('button', () => {
  render(<Button />)

  const buttonElement = screen.getByText(/my button: type primary/i)

  expect(buttonElement).toBeInTheDocument()
  expect(buttonElement).toHaveTextContent('my button: type primary')
  expect(buttonElement.outerHTML).toMatchInlineSnapshot(
    `"<button class="my-button">my button: type primary</button>"`,
  )

  expect(buttonElement).toHaveClass('my-button')
})
