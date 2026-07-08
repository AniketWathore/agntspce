const ansiRe = /[\u001b\u009b][[@-Z\]^_`~]|[\u001b\u009b][()[\]{}#%?][@-Z\]^_`~]|[\u001b\u009b][\d;#]*[@-Z\]^_`~]|[\u001b\u009b]\[\d*(?:;\d+)*[A-Za-z]|[\u001b\u009b][PX^_].*?(?:\u001b\\|\u0007|\u001b)|[\u001b\u009b]./g

export function stripAnsi(text: string): string {
  return text.replace(ansiRe, '')
    .replace(/[\u200b-\u200f\u2028-\u202f\ufeff]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/(?<!\n)\r(?!\n)/g, '\n')
    .replace(/[\x00\x08\x0b\x0c\x0e\x0f]/g, '')
}
