import { IModPack, IModPackMod } from './types/IModPack';
import { LOGO_NAME, modToPack } from './util/modpack';
import { makeProgressFunction } from './util/util';

import * as PromiseBB from 'bluebird';
import * as _ from 'lodash';
import Zip = require('node-7z');
import * as path from 'path';
import { dir as tmpDir } from 'tmp';
import { actions, fs, log, selectors, types, util } from 'vortex-api';

async function withTmpDir(cb: (tmpPath: string) => Promise<void>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tmpDir((err, tmpPath, cleanup) => {
      if (err !== null) {
        return reject(err);
      } else {
        cb(tmpPath)
          .then(() => {
            resolve();
          })
          .catch(tmpErr => {
            reject(tmpErr);
          })
          .finally(() => {
            try {
              cleanup();
            } catch (err) {
              // cleanup failed
              log('warn', 'Failed to clean up temp file', { path, err });
            }
          });
      }
    });
  });
}

async function zip(zipPath: string, sourcePath: string): Promise<void> {
  const zipper = new Zip();
  const files = await fs.readdirAsync(sourcePath);
  await zipper.add(zipPath, files.map(fileName => path.join(sourcePath, fileName)));
}

async function generateModPackInfo(state: types.IState, gameId: string, collection: types.IMod,
                                   progress: (percent: number, text: string) => void,
                                   error: (message: string, replace: any) => void)
                                   : Promise<IModPack> {
  const mods = state.persistent.mods[gameId];
  const stagingPath = selectors.installPath(state);
  return modToPack(state, gameId, stagingPath, collection, mods, progress, error);
}

async function writePackToFile(state: types.IState, info: IModPack,
                               mod: types.IMod, outputPath: string) {
  await fs.ensureDirWritableAsync(outputPath, () => PromiseBB.resolve());

  await fs.writeFileAsync(
    path.join(outputPath, 'modpack.json'), JSON.stringify(info, undefined, 2));

  const stagingPath = selectors.installPath(state);
  const modPath = path.join(stagingPath, mod.installationPath);

  try {
    await fs.copyAsync(path.join(modPath, LOGO_NAME), path.join(outputPath, LOGO_NAME));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    } // don't strictly need an icon I guess
  }
  try {
    await fs.copyAsync(path.join(modPath, 'INI Tweaks'), path.join(outputPath, 'INI Tweaks'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    } // else: no ini tweak, no problem
  }
  const zipPath = path.join(modPath,
                            `modpack_${util.getSafe(mod.attributes, ['version'], '1.0.0')}.7z`);
  await zip(zipPath, outputPath);
  await fs.removeAsync(outputPath);
  return zipPath;
}

function filterInfoMod(mod: IModPackMod): IModPackMod {
  return _.omit(mod, ['hashes', 'choices', 'details']);
}

function filterInfo(input: IModPack): any {
  const info = input.info;
  return {
    info,
    mods: input.mods.map(mod => filterInfoMod(mod)),
  };
}

async function queryErrorsContinue(api: types.IExtensionApi,
                                   errors: Array<{message: string, replace: any}>) {
  const res = await api.showDialog('error', 'Errors creating collection', {
    text: 'There were errors creating the collection, do you want to proceed anyway?',
    message: errors.map(err => api.translate(err.message, { replace: err.replace })).join('\n'),
  }, [
    { label: 'Cancel' },
    { label: 'Continue' },
  ]);

  if (res.action === 'Cancel') {
    throw new util.UserCanceled();
  }
}

export async function doExportToAPI(api: types.IExtensionApi,
                                    gameId: string,
                                    modId: string)
                                    : Promise<number> {
  const state: types.IState = api.store.getState();
  const mod = state.persistent.mods[gameId][modId];

  const { progress, progressEnd } = makeProgressFunction(api);

  const errors: Array<{ message: string, replace: any }> = [];

  const onError = (message: string, replace: any) => {
    errors.push({ message, replace });
  };

  let info: IModPack;

  let collectionId: number;

  try {
    info = await generateModPackInfo(state, gameId, mod, progress, onError);
    if (errors.length > 0) {
      await queryErrorsContinue(api, errors);
    }
    await withTmpDir(async tmpPath => {
      const filePath = await writePackToFile(state, info, mod, tmpPath);
      const result: any = await (util as any).toPromise(cb =>
        api.events.emit('submit-collection', filterInfo(info), filePath, cb));
      collectionId = result.collectionId;
      api.store.dispatch(actions.setModAttribute(gameId, modId, 'collectionId', collectionId));
    });
    progressEnd();
  } catch (err) {
    progressEnd();
    if (err.name === 'ModFileNotFound') {
      const file = info.mods.find(iter => iter.source.fileId === err.fileId);
      api.sendNotification({
        type: 'error',
        title: 'The server can\'t find one of the files in the collection, '
             + 'are mod id and file id for it set correctly?',
        message: file !== undefined ? file.name : `id: ${err.fileId}`,
      });
      throw new util.ProcessCanceled('Mod file not found');
    } else if (err.constructor.name === 'ParameterInvalid') {
      api.sendNotification({
        type: 'error',
        title: 'The server rejected this collection',
        message: err.message || '<No reason given>',
      });
      throw new util.ProcessCanceled('collection rejected');
    } else {
      throw err;
    }
  }

  return collectionId;
}

export async function doExportToFile(api: types.IExtensionApi, gameId: string, modId: string) {
  const state: types.IState = api.store.getState();
  const mod = state.persistent.mods[gameId][modId];

  const { progress, progressEnd } = makeProgressFunction(api);

  const errors: Array<{ message: string, replace: any }> = [];

  const onError = (message: string, replace: any) => {
    errors.push({ message, replace });
  };

  try {
    const stagingPath = selectors.installPathForGame(state, gameId);
    const modPath = path.join(stagingPath, mod.installationPath);
    const outputPath = path.join(modPath, 'build');
    const info = await generateModPackInfo(state, gameId, mod, progress, onError);
    const zipPath = await writePackToFile(state, info, mod, outputPath);
    const dialogActions = [
      {
        title: 'Open', action: () => {
          util.opn(path.join(stagingPath, mod.installationPath)).catch(() => null);
        },
      },
    ];

    if (errors.length > 0) {
      const li = (input: string) => `[*]${input}`;
      dialogActions.unshift({
        title: 'Errors',
        action: () => {
          api.showDialog('error', 'Collection Export Errors', {
            bbcode: '[list]'
              + errors.map(err => li(api.translate(err.message, { replace: err.replace })))
              + '[/list]',
          }, [
            { label: 'Close' },
          ]);
        },
      });
    }

    api.sendNotification({
      id: 'collection-exported',
      title: errors.length > 0 ? 'Collection exported, there were errors' : 'Collection exported',
      message: zipPath,
      type: errors.length > 0 ? 'warning' : 'success',
      actions: dialogActions,
    });
  } catch (err) {
    api.showErrorNotification('Failed to export collection', err);
    return Promise.resolve();
  }
  progressEnd();
}
