/**
 * Safe DOM Manipulation Utilities
 * Prevents NotFoundError and other DOM-related issues
 */

/**
 * Safely remove a DOM node using modern remove() method
 * @param {Node|Element} node - The node to remove
 * @returns {boolean} - True if removed successfully
 */
export function safeRemoveNode(node) {
  try {
    if (!node) return false;

    // Verify node is attached to the DOM
    if (!node.parentNode) {
      console.warn('Node is not attached to the DOM', node);
      return false;
    }

    // Modern method: element.remove() (IE 11+)
    if (typeof node.remove === 'function') {
      node.remove();
      return true;
    }

    // Fallback for older browsers
    if (node.parentNode) {
      node.parentNode.removeChild(node);
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error removing node:', error.message);
    return false;
  }
}

/**
 * Safely remove child from parent with validation
 * @param {Node} parentNode - The parent node
 * @param {Node} childNode - The child node to remove
 * @returns {boolean} - True if removed successfully
 */
export function safeRemoveChild(parentNode, childNode) {
  try {
    if (!parentNode || !childNode) return false;

    // Check if childNode is actually a child of parentNode
    if (childNode.parentNode === parentNode) {
      parentNode.removeChild(childNode);
      return true;
    }

    // Alternative: Check if parent contains the child
    if (parentNode.contains(childNode)) {
      parentNode.removeChild(childNode);
      return true;
    }

    console.warn('Node is not a child of the parent');
    return false;
  } catch (error) {
    console.error('Error removing child node:', error.message);
    return false;
  }
}

/**
 * Safely clear all children of a DOM element
 * @param {Node} parentNode - The parent node to clear
 * @returns {number} - Number of children removed
 */
export function safeClearChildren(parentNode) {
  if (!parentNode) return 0;

  let count = 0;
  try {
    while (parentNode.firstChild) {
      if (safeRemoveNode(parentNode.firstChild)) {
        count++;
      } else {
        break;
      }
    }
  } catch (error) {
    console.error('Error clearing children:', error.message);
  }

  return count;
}

/**
 * Safely update or create an element in the DOM
 * @param {string} elementId - The element ID
 * @param {string} html - The HTML content
 * @returns {boolean} - Success status
 */
export function safeUpdateElement(elementId, html) {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      console.warn(`Element with id '${elementId}' not found`);
      return false;
    }

    element.innerHTML = html;
    return true;
  } catch (error) {
    console.error('Error updating element:', error.message);
    return false;
  }
}

/**
 * Safely remove multiple elements
 * @param {NodeList|Array} elements - Elements to remove
 * @returns {number} - Number of elements removed
 */
export function safeRemoveElements(elements) {
  let count = 0;
  const elementArray = Array.from(elements || []);

  elementArray.forEach(element => {
    try {
      if (safeRemoveNode(element)) {
        count++;
      }
    } catch (error) {
      console.warn(`Failed to remove element:`, element, error.message);
    }
  });

  return count;
}

/**
 * Safely batch update DOM elements
 * @param {Object} updates - Key: elementId, Value: HTML content
 * @returns {Object} - Results of each update
 */
export function safeBatchUpdateDOM(updates) {
  const results = {};

  for (const [elementId, html] of Object.entries(updates)) {
    results[elementId] = safeUpdateElement(elementId, html);
  }

  return results;
}

/**
 * DOM Ready helper with safe operations
 * @param {Function} callback - Function to execute when DOM is ready
 */
export function onDOMReady(callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
}
