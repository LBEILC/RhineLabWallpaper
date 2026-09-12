import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { assetUrl } from "./asset-url";
import { disposeThreeTree } from "./three-resources";

export type ModelPrecision = "high" | "medium" | "low";
export const modelPrecision = (value: unknown): ModelPrecision =>
  value === "medium" || value === "low" ? value : "high";
const medium = new Set(["Titanium_Fasteners", "Ivory_Edges"]);
const low = new Set([...medium, "Internal_Ceramic", "Optical_Edges", "Subsurface_Optics",
  "Optical_Film_Edge", "Amber_Optical_Inlay", "Case_Engraving", "Case_Engraving_Highlight", "Moulded_Lettering"]);
const surface = (mesh: THREE.Mesh): string => mesh.userData.surface ??
  (mesh.material as THREE.Material).name.replace(/(?:\.\d+)+$/, "");
type Targets = { arrays: THREE.InstancedMesh[]; models: THREE.Group[]; theme?: THREE.InstancedBufferAttribute };

// Own both original and alternate geometries for the lifetime of one scene.
// Returning cards share these buffers; switching never replaces their objects.
export class ModelPrecisionController {
  current: ModelPrecision = "high";
  private requested?: ModelPrecision;
  private generation = 0;
  private disposed = false;
  private pending: Promise<void> = Promise.resolve();
  private originals = new Map<string, THREE.BufferGeometry>();
  private variants = new Map<ModelPrecision, Promise<Map<string, THREE.BufferGeometry>>>();
  constructor(private targets: () => Targets, private invalidate: () => void) {}

  private load(tier: ModelPrecision) {
    let promise = this.variants.get(tier);
    if (!promise) {
      promise = new GLTFLoader().loadAsync(assetUrl(`assets/archive-precision-${tier}.glb`)).then(gltf => {
        const geometry = new Map<string, THREE.BufferGeometry>();
        try {
          gltf.scene.updateMatrixWorld(true);
          gltf.scene.traverse(object => {
            if (!(object instanceof THREE.Mesh) || !(tier === "medium" ? medium : low).has(surface(object))) return;
            const name = surface(object);
            if (geometry.has(name)) throw new Error(`Duplicate precision surface: ${name}`);
            const next = object.geometry.clone().applyMatrix4(object.matrixWorld);
            geometry.set(name, next);
            const before = this.originals.get(name);
            if (!before) throw new Error(`Missing original surface: ${name}`);
            before.computeBoundingBox(); next.computeBoundingBox();
            const delta = before.boundingBox!.min.distanceTo(next.boundingBox!.min)
              + before.boundingBox!.max.distanceTo(next.boundingBox!.max);
            if (delta > .035) throw new Error(`Precision changes bounds: ${name}`);
          });
          for (const name of tier === "medium" ? medium : low)
            if (!geometry.has(name)) throw new Error(`Missing precision surface: ${name}`);
          return geometry;
        } catch (error) {
          geometry.forEach(value => value.dispose());
          throw error;
        } finally { disposeThreeTree(gltf.scene); }
      }).catch(error => { this.variants.delete(tier); throw error; });
      this.variants.set(tier, promise);
    }
    return promise;
  }

  apply(tier: ModelPrecision): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.requested === tier) return this.pending;
    const first = this.targets();
    if (!this.originals.size) first.models[0].traverse(object => {
      if (object instanceof THREE.Mesh && low.has(surface(object)))
        this.originals.set(surface(object), object.geometry);
    });
    this.requested = tier;
    const generation = ++this.generation;
    this.pending = (async () => {
      try {
        const geometry = tier === "high" ? undefined : await this.load(tier);
        if (this.disposed || generation !== this.generation) return;
        const targets = this.targets();
        const replace = (object: THREE.Object3D, array: boolean) => {
          if (!(object instanceof THREE.Mesh)) return;
          const name = surface(object);
          const original = this.originals.get(name);
          if (!original) return;
          const changed = tier === "low" ? low : medium;
          object.geometry = geometry && changed.has(name) && (array || tier === "low")
            ? geometry.get(name)! : original;
          if (array && targets.theme) object.geometry.setAttribute("archiveTheme", targets.theme);
        };
        targets.arrays.forEach(object => replace(object, true));
        targets.models.forEach(model => model.traverse(object => replace(object, false)));
        this.current = tier;
        this.invalidate();
      } catch (error) {
        if (this.disposed || generation !== this.generation) return;
        this.requested = undefined; // retain the last working tier; allow explicit retry
        throw error;
      }
    })();
    return this.pending;
  }

  dispose() {
    this.disposed = true;
    this.generation++;
    this.originals.forEach(geometry => geometry.dispose());
    this.variants.forEach(promise => void promise.then(map => map.forEach(geometry => geometry.dispose())).catch(() => {}));
    this.variants.clear();
  }
}
