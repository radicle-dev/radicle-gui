import { describe, test } from "vitest";

import { HttpdClient } from "@http-client";
import config from "@app/lib/config";
import {
  aliceMainHead,
  aliceRemote,
  cobRid,
  sourceBrowsingRid,
} from "@tests/support/fixtures.js";

describe("repo", () => {
  const api = new HttpdClient({
    hostname: "127.0.0.1",
    port: config.nodes.defaultHttpdPort,
    scheme: "http",
  });

  test("#getByDelegate(delegateId)", async () => {
    await api.repo.getByDelegate(aliceRemote);
  });

  test("#getAll()", async () => {
    await api.repo.getAll();
  });

  test("#getByRid(rid)", async () => {
    await api.repo.getByRid(sourceBrowsingRid);
  });

  test("#getActivity(rid)", async () => {
    await api.repo.getActivity(sourceBrowsingRid);
  });

  test("#getReadme(rid, sha)", async () => {
    await api.repo.getReadme(sourceBrowsingRid, aliceMainHead);
  });

  test("#getBlob(rid, sha, path)", async () => {
    await api.repo.getBlob(sourceBrowsingRid, aliceMainHead, "src/true.c");
  });

  test("#getTree(rid, sha)", async () => {
    await api.repo.getTree(sourceBrowsingRid, aliceMainHead);
  });

  test("#getTreeStats(rid, sha)", async () => {
    await api.repo.getTreeStatsBySha(sourceBrowsingRid, aliceMainHead);
  });

  test("#getCommitCountBySha(rid, sha)", async () => {
    await api.repo.getCommitCountBySha(sourceBrowsingRid, aliceMainHead);
  });

  test("#getDiffStats(rid, base, oid)", async () => {
    await api.repo.getDiffStats(
      sourceBrowsingRid,
      "90f6d058ece12f75f349bc7bbe88142187fe0379",
      aliceMainHead,
    );
  });

  test("#getTree(rid, sha, path)", async () => {
    await api.repo.getTree(sourceBrowsingRid, aliceMainHead, "src");
  });

  test("#getRemoteByPeer(rid, peer)", async () => {
    await api.repo.getRemoteByPeer(sourceBrowsingRid, aliceRemote.substring(8));
  });

  test("#getAllCommits(rid)", async () => {
    await api.repo.getAllCommits(sourceBrowsingRid);
  });

  // TODO: test since/until properly.
  test("#getAllCommits(rid, {parent, since, until, page, perPage})", async () => {
    await api.repo.getAllCommits(sourceBrowsingRid, {
      parent: aliceMainHead,
      since: 1679065819581,
      until: 1679065819590,
      page: 1,
      perPage: 2,
    });
  });

  test("#getCommitBySha(rid, sha)", async () => {
    await api.repo.getCommitBySha(sourceBrowsingRid, aliceMainHead);
  });

  test("#getDiff(rid, revisionBase, revisionOid)", async () => {
    await api.repo.getDiff(
      sourceBrowsingRid,
      "90f6d058ece12f75f349bc7bbe88142187fe0379",
      aliceMainHead,
    );
  });

  test("#getIssueById(rid, issueId)", async () => {
    await api.repo.getIssueById(
      cobRid,
      "d481fe6e562dd78129589d4738f171a8380fcb19",
    );
  });

  test("#getAllIssues(rid)", async () => {
    await api.repo.getAllIssues(cobRid, {
      page: 0,
      perPage: 5,
      status: "open",
    });
  });

  test("#getPatchByOid(rid, patchId)", async () => {
    await api.repo.getPatchById(
      cobRid,
      "59a0821edc73630bce540596cffc7854da557365",
    );
  });

  test("#getAllPatches(rid)", async () => {
    await api.repo.getAllPatches(cobRid);
  });
});
