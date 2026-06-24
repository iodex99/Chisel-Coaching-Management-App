import { BrowserWindow } from 'electron'
import { writeFileSync, rmSync } from 'fs'
import { dataPath } from '../paths'

/** Load HTML in a hidden window and run `fn`, cleaning up the temp file + window. */
async function withWindow<T>(html: string, fn: (win: BrowserWindow) => Promise<T>): Promise<T> {
  const tmp = dataPath('receipts', `.print-${Date.now()}-${Math.floor(Math.random() * 1e6)}.html`)
  writeFileSync(tmp, html, 'utf8')
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: false } })
  try {
    await win.loadFile(tmp)
    return await fn(win)
  } finally {
    win.destroy()
    try {
      rmSync(tmp)
    } catch {
      /* ignore */
    }
  }
}

/** Render HTML to a PDF file. */
export async function htmlToPdf(html: string, outFile: string): Promise<string> {
  await withWindow(html, async (win) => {
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
    writeFileSync(outFile, pdf)
  })
  return outFile
}

/** Open the system print dialog for the given HTML. */
export async function printHtml(html: string): Promise<void> {
  await withWindow(html, (win) =>
    new Promise<void>((resolve) => {
      win.webContents.print({ printBackground: true }, () => resolve())
    })
  )
}
