import type { PromptSectionDefinition } from './types'

export class PromptProgram {
  private sections: PromptSectionDefinition[] = []

  section(id: string, definition: Omit<PromptSectionDefinition, 'id'>): this {
    this.sections.push({ id, ...definition })
    return this
  }

  add(section: PromptSectionDefinition): this {
    this.sections.push(section)
    return this
  }

  toJSON(): PromptSectionDefinition[] {
    return this.sections
  }

  render(): string {
    return this.sections.map(section => {
      const lines = [
        `<prompt-section id="${section.id}" output="${section.outputPath}">`,
        `resources: ${section.resources.join(', ') || 'none'}`,
        'instructions:',
        ...section.instructions.map(instruction => `- ${instruction}`)
      ]

      if (section.forbidden?.length) {
        lines.push('forbidden:', ...section.forbidden.map(item => `- ${item}`))
      }

      if (section.examples?.length) {
        lines.push('examples:', ...section.examples.map(example => `- ${example}`))
      }

      lines.push('</prompt-section>')
      return lines.join('\n')
    }).join('\n\n')
  }
}

export function createPromptProgram(): PromptProgram {
  return new PromptProgram()
}
