import * as React from 'react';
import { Button } from 'react-bootstrap';
import { types, util } from 'vortex-api';

export interface IInstructionsProps {
  t: types.TFunction;
  collection: types.IMod;
  mods: { [modId: string]: types.IMod };
  onToggleInstructions: (evt: React.MouseEvent<any>) => void;
}

interface IInstructionsEntry {
  rule: types.IModRule;
  mod: types.IMod;
  name: string;
  instructions: string;
}

function Instructions(props: IInstructionsProps) {
  const { t, collection, mods, onToggleInstructions } = props;
  
  const { required, optional } = React.useMemo(() => {
    return (collection.rules ?? []).reduce((prev, rule) => {
      if ((rule.extra?.instructions === undefined)
          || !['requires', 'recommends'].includes(rule.type)) {
        return prev;
      }

      const mod: types.IMod = util.findModByRef(rule.reference, mods);

      if (mod !== undefined) {
        const entry: IInstructionsEntry = {
          rule,
          mod,
          name: util.renderModReference(rule.reference),
          instructions: rule.extra?.instructions
        };

        if (rule.type === 'requires') {
          prev.required.push(entry);
        } else {
          prev.optional.push(entry);
        }
      }

      return prev;
    }, { required: [] as IInstructionsEntry[], optional: [] as IInstructionsEntry[] });
  }, [mods, collection]);

  return (
    <>
      <div className='collection-instructions-text'>
        {collection.attributes?.installInstructions}
      </div>
      {(required.length > 0) ? (
        <>
          <h4>{t('Instructions - Required Mods')}</h4>
          <div className='collection-instructions-container'>
            <table>
              <tbody>
                {required.map((iter) => (
                  <tr key={iter.name}>
                    <td className='collection-mod-name'>{iter.name}</td>
                    <td className='collection-mod-instructions'>
                      <div>{iter.instructions}</div>
                    </td>
                    <td className='collection-mod-actions'>
                      <Button data-modid={iter.mod?.id} onClick={onToggleInstructions}>
                        {t('Open instructions')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>) : null}
      {(optional.length > 0) ? (
        <>
          <h4>{t('Instructions - Optional Mods')}</h4>
          <div className='collection-instructions-container'>
            <table>
              <tbody>
                {optional.map(iter => (
                  <tr key={iter.name}>
                    <td className='collection-mod-name'>{iter.name}</td>
                    <td className='collection-mod-instructions'>
                      <div>{iter.instructions}</div>
                    </td>
                    <td className='collection-mod-actions'>
                      <Button data-modid={iter.mod?.id} onClick={onToggleInstructions}>
                        {t('Open instructions')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>) : null}
    </>
  );
}

export default Instructions;
