import React from 'react'
import type { Connector, NewspaperIssue, NewspaperModuleDefinition } from './types'

export function defineNewspaperModule<TOutput>(
  definition: NewspaperModuleDefinition<TOutput>
): NewspaperModuleDefinition<TOutput> {
  return definition
}

export function defineConnector<TParams, TResult>(
  connector: Connector<TParams, TResult>
): Connector<TParams, TResult> {
  return connector
}

export function renderModule<TOutput>(
  definition: NewspaperModuleDefinition<TOutput>,
  data: TOutput,
  issue: NewspaperIssue
) {
  if (!definition.render) {
    throw new Error(`Module ${definition.id} does not expose a renderer`)
  }

  const Renderer = definition.render
  return React.createElement(Renderer, { data, issue })
}
