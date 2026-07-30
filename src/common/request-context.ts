import {AsyncLocalStorage} from 'node:async_hooks';
export interface RequestContext {correlationId:string; userId?:string; organizationId?:string}
export const requestContext=new AsyncLocalStorage<RequestContext>();
