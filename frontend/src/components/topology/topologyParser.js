import yaml from 'js-yaml';

/**
 * Parse Containerlab YAML content and extract topology information
 * for Cytoscape.js visualization.
 *
 * Ported from /opt/clab-topo-viewer/app.py parse_containerlab_yaml()
 *
 * @param {string} yamlContent - Raw YAML content
 * @returns {object} Parsed topology with nodes and edges for Cytoscape.js
 */
export function parseContainerlabYaml(yamlContent) {
  const data = yaml.load(yamlContent);

  if (!data || !data.topology) {
    throw new Error("Invalid Containerlab YAML: missing 'topology' section");
  }

  const topology = data.topology;
  const nodes = topology.nodes || {};
  const links = topology.links || [];
  const topoName = data.name || 'Unknown Topology';

  // Process nodes for Cytoscape.js
  const cyNodes = Object.entries(nodes).map(([nodeName, nodeConfig]) => {
    const nodeKind = (nodeConfig && nodeConfig.kind) || 'unknown';
    const nodeClass = 'node-' + nodeKind.toLowerCase();
    const containerName = `clab-${topoName}-${nodeName}`;
    const fqdn = `${nodeName}.${topoName}`;

    return {
      data: {
        id: nodeName,
        label: nodeName,
        kind: nodeKind,
        config: nodeConfig || {},
        topo_name: topoName,
        container_name: containerName,
        fqdn: fqdn,
      },
      classes: nodeClass,
    };
  });

  // Process links for Cytoscape.js
  const cyEdges = [];
  links.forEach((link, idx) => {
    const endpoints = link.endpoints || [];
    if (endpoints.length === 2) {
      const sourceParts = endpoints[0].split(':');
      const targetParts = endpoints[1].split(':');

      if (sourceParts.length >= 1 && targetParts.length >= 1) {
        const sourceNode = sourceParts[0];
        const targetNode = targetParts[0];
        const sourceIntf = sourceParts.length > 1 ? sourceParts[1] : '';
        const targetIntf = targetParts.length > 1 ? targetParts[1] : '';

        let edgeLabel;
        if (sourceIntf && targetIntf) {
          edgeLabel = `${sourceIntf} \u2194 ${targetIntf}`;
        } else if (sourceIntf) {
          edgeLabel = `${sourceIntf} \u2192 ?`;
        } else if (targetIntf) {
          edgeLabel = `? \u2192 ${targetIntf}`;
        } else {
          edgeLabel = `${sourceNode} \u2194 ${targetNode}`;
        }

        cyEdges.push({
          data: {
            id: `edge_${idx}`,
            source: sourceNode,
            target: targetNode,
            source_interface: sourceIntf,
            target_interface: targetIntf,
            label: edgeLabel,
          },
        });
      }
    }
  });

  const nodeTypes = [...new Set(cyNodes.map((n) => n.data.kind))];

  return {
    name: topoName,
    elements: {
      nodes: cyNodes,
      edges: cyEdges,
    },
    stats: {
      node_count: cyNodes.length,
      link_count: cyEdges.length,
      node_types: nodeTypes,
    },
  };
}
