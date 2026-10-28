import { DxfLoader, type CadLoadInput, type CadLoadOptions, type CadLayer } from '@flyfish-dev/cad-viewer';

// dxf-parser exposes layer records under tables.layer.layers. The viewer's
// normalizer currently expects a flat table, so supply that form explicitly.
export class LayerAwareDxfLoader extends DxfLoader {
  async load(input: CadLoadInput, options: CadLoadOptions = {}) {
    const result = await super.load(input, options);
    const raw = result.raw as { tables?: { layer?: { layers?: Record<string, { name?: string; colorIndex?: number; color?: number; visible?: boolean; frozen?: boolean; locked?: boolean }> } } } | undefined;
    const layers = raw?.tables?.layer?.layers;
    if (layers) {
      result.document.layers = Object.fromEntries(Object.entries(layers).map(([key, layer]) => {
        const name = layer.name ?? key;
        const value: CadLayer = { name, colorIndex: Math.abs(layer.colorIndex ?? 7), isVisible: layer.visible !== false && (layer.colorIndex ?? 7) >= 0, isFrozen: layer.frozen, isLocked: layer.locked };
        if (typeof layer.color === 'number') value.color = '#' + layer.color.toString(16).padStart(6, '0');
        return [name, value];
      }));
    }
    for (const entity of result.document.entities) {
      const name = entity.layer ?? '0';
      if (!Object.hasOwn(result.document.layers, name)) {
        Object.defineProperty(result.document.layers, name, { value: { name, isVisible: true, colorIndex: 7 }, enumerable: true, writable: true, configurable: true });
      }
    }
    return result;
  }
}
