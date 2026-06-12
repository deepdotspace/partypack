// Generouted, changes to this file will be overridden
/* eslint-disable */

import { components, hooks, utils } from '@generouted/react-router/client'

export type Path =
  | `*`
  | `/`
  | `/play/:code`
  | `/recap/:id`
  | `/stage/:code`

export type Params = {
  '/*': { '*': string }
  '/play/:code': { code: string }
  '/recap/:id': { id: string }
  '/stage/:code': { code: string }
}

export type ModalPath = never

export const { Link, Navigate } = components<Path, Params>()
export const { useModals, useNavigate, useParams } = hooks<Path, Params, ModalPath>()
export const { redirect } = utils<Path, Params>()
