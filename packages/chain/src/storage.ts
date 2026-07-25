import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers } from "ethers";
import { withRetry } from "./retry";

export interface StorageConfig {
  rpc: string;
  indexer: string;
  privateKey: string;
}

export interface UploadResult {
  rootHash: string;
  txHash?: string;
}

export async function uploadBlob(
  config: StorageConfig,
  payload: Uint8Array
): Promise<UploadResult> {
  return withRetry(
    async () => {
      const file = new MemData(payload);
      const [tree, treeErr] = await file.merkleTree();
      if (treeErr || !tree) {
        throw new Error(treeErr?.message ?? "merkleTree failed");
      }

      const rootHash = tree.rootHash();
      if (!rootHash) {
        throw new Error("no root hash");
      }

      const provider = new ethers.JsonRpcProvider(config.rpc);
      const signer = new ethers.Wallet(config.privateKey, provider);
      const indexer = new Indexer(config.indexer);

      const [result, uploadErr] = await indexer.upload(file, config.rpc, signer);
      if (uploadErr) {
        throw new Error(uploadErr.message);
      }

      const storedRoot =
        "rootHash" in result ? result.rootHash : result.rootHashes[0];
      const txHash =
        "txHash" in result ? result.txHash : result.txHashes[0];

      return { rootHash: storedRoot ?? rootHash, txHash };
    },
    { label: "0g-storage", attempts: 3, timeoutMs: 60_000 }
  );
}

export function storageFromEnv(): StorageConfig | null {
  const rpc = process.env.ZEROG_RPC;
  const indexer = process.env.ZEROG_INDEXER;
  const privateKey = process.env.ZEROG_PRIVATE_KEY;
  if (!rpc || !indexer || !privateKey) return null;
  return { rpc, indexer, privateKey };
}
