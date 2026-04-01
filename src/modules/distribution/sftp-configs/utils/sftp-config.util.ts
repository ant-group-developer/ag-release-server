import { decryptSecretSafe } from "src/utils/util.encrypt";
import { SftpConfig } from "../entities/sftp-config.entity";

export function decryptSecretSftpConfigSafe(e: SftpConfig) {
    if (e.metadata?.password) {
        e.metadata.password = decryptSecretSafe(e.metadata.password);
    }

    if (e.metadata?.privateKey) {
        e.metadata.privateKey = decryptSecretSafe(e.metadata.privateKey);
    }
}

export function decryptSecretSftpConfigListSafe(listE: SftpConfig[]) {
    listE.forEach((e) => decryptSecretSftpConfigSafe(e));
}