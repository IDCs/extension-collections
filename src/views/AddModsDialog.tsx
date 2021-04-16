import * as React from 'react';
import { useMemo, useState } from 'react';
import { Button } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { Modal, selectors, Table, TableTextFilter, types, util } from 'vortex-api';
import { startAddModsToCollection } from '../actions/session';
import { alreadyIncluded } from '../collectionCreate';
import { NAMESPACE } from '../constants';

export interface IAddModsDialogProps {
  t: types.TFunction;
  onAddSelection: (collectionId: string, modIds: string[]) => void;
}

interface IModWithState {
  selected: boolean;
  mod: types.IMod;
}

function makeColumns(onSelect: (modIds: string[], value: boolean) => void)
                     : Array<types.ITableAttribute<IModWithState>> {
  let collator: Intl.Collator;
  return [
    /*
    {
      id: 'selected',
      name: 'Selected',
      calc: (mod: IModWithState) => mod.selected,
      placement: 'table',
      edit: {
        onChangeValue: (mod: IModWithState | IModWithState[], newValue: boolean) => {
          const mods = Array.isArray(mod) ? mod : [mod];
          onSelect(mods.map(mod => mod.mod.id), newValue);
        },
      },
    },
    */
    {
      id: 'name',
      name: 'Mod Name',
      description: 'Mod Name',
      calc: (mod: IModWithState) => util.renderModName(mod.mod),
      placement: 'table',
      edit: {},
      isDefaultSort: true,
      isSortable: true,
      filter: new TableTextFilter(true),
      sortFunc: (lhs: string, rhs: string, locale: string): number => {
        if (collator === undefined) {
          collator = new Intl.Collator(locale, { sensitivity: 'base' });
        }
        return collator.compare(lhs, rhs);
      },
    }, {
      id: 'version',
      name: 'Version',
      description: 'The version to install',
      calc: (mod: IModWithState) => mod.mod.attributes?.version ?? '',
      placement: 'table',
      edit: {},
    },
  ];
}

function AddModsDialog(props: IAddModsDialogProps) {
  const { onAddSelection } = props;
  const [ t ] = useTranslation(NAMESPACE);
  const store = useStore();
  const dispatch = useDispatch();
  const hide = React.useCallback(() => {
    dispatch(startAddModsToCollection(undefined));
  }, []);

  const [ selection, setSelection ] = useState(new Set<string>());

  const state = store.getState();
  const gameId = selectors.activeGameId(state);
  const collectionId: string = useSelector<any, string>(state => state.session.collections.addModsId);

  const collection = collectionId !== undefined
    ? state.persistent.mods[gameId]?.[collectionId]
    : undefined;

  const mods = state.persistent.mods[gameId];
  const modsWithState = React.useMemo(() => Object.keys(mods)
    .reduce((prev, modId) => {
      if (!alreadyIncluded(collection?.rules, modId)) {
        prev[modId] = {
          selected: selection.has(modId),
          mod: mods[modId],
        };
      }
      return prev;
    }, {}), [selection, collectionId]);
  const changeSelection = React.useCallback((modIds: string[], selected: boolean) => {
    if (selected) {
      setSelection(new Set<string>([].concat(Array.from(selection), modIds)));
    } else {
      setSelection(new Set<string>(Array.from(selection).filter(modId => !modIds.includes(modId))));
    }
  }, [selection, setSelection, collectionId]);
  const columns = React.useMemo(() => makeColumns(changeSelection),
    [selection, setSelection, collectionId]);

  const addSelection = React.useCallback(() => {
    onAddSelection(collectionId, Array.from(selection));
    hide();
  }, [ onAddSelection, hide, selection, collectionId ]);
  const updateSelection = React.useCallback((modIds: string[]) => {
    setSelection(new Set(modIds));
  }, [setSelection]);

  console.log('render addmodsdialog');

  const TableX: any = Table;
  return (
    <Modal
      id='add-mods-to-collection-dialog'
      className='collection-add-mods-dialog'
      show={collection !== undefined}
      onHide={hide}
    >
      <Modal.Header>
        <Modal.Title>{util.renderModName(collection)}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {t('Select (click, shift-click, ...) the mods you want to add to your collection below:')}
        <TableX
          tableId='collection-add-mods'
          data={modsWithState}
          staticElements={columns}
          actions={[]}
          showDetails={false}
          hasActions={false}
          onChangeSelection={updateSelection}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={hide}>{t('Close')}</Button>
        <Button onClick={addSelection}>{t('Add Selection')}</Button>
      </Modal.Footer>
    </Modal>
  );
}

export default AddModsDialog;
