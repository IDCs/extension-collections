// import { ICollectionMod } from 'nexus-api';
import { types } from 'vortex-api';

export type IModEx = types.IMod & types.IProfileMod & {
  collectionRule: types.IModRule,
  progress?: number,
  // infoFromApi?: ICollectionMod;
  infoFromApi?: any;
};
