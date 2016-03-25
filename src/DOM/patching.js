import { isNullOrUndefined, isAttrAnEvent, isString, isNumber, addChildrenToProps, isStatefulComponent, isStringOrNumber, isArray, isInvalidNode, isObject } from '../core/utils';
import { diffNodes } from './diffing';
import { mountNode } from './mounting';
import { insertOrAppend, remove, createEmptyTextNode, detachNode } from './utils';
import { recyclingEnabled, pool } from './recycling';

// Checks if property is boolean type
function booleanProps(prop) {
	switch (prop.length) {
		case 5: return prop === 'value';
		case 7: return prop === 'checked';
		case 8: return prop === 'disabled' || prop === 'selected';
		default: return false;
	}
}

export function updateTextNode(dom, lastChildren, nextChildren) {
	if (isStringOrNumber(lastChildren)) {
		dom.firstChild.nodeValue = nextChildren;
	} else {
		dom.textContent = nextChildren;
	}
}

export function patchNode(lastNode, nextNode, parentDom, namespace, lifecycle, context, instance) {
	if (isInvalidNode(lastNode)) {
		mountNode(nextNode, parentDom, namespace, lifecycle, context, instance);
		return;
	}
	if (isInvalidNode(nextNode)) {
		remove(lastNode, parentDom);
		return;
	}
	diffNodes(lastNode, nextNode, parentDom, namespace, lifecycle, context, lastNode.tpl !== null && nextNode.tpl !== null, instance);
}

export const canBeUnitlessProperties = {
	animationIterationCount: true,
	boxFlex: true,
	boxFlexGroup: true,
	columnCount: true,
	counterIncrement: true,
	fillOpacity: true,
	flex: true,
	flexGrow: true,
	flexOrder: true,
	flexPositive: true,
	flexShrink: true,
	float: true,
	fontWeight: true,
	gridColumn: true,
	lineHeight: true,
	lineClamp: true,
	opacity: true,
	order: true,
	orphans: true,
	stopOpacity: true,
	strokeDashoffset: true,
	strokeOpacity: true,
	strokeWidth: true,
	tabSize: true,
	transform: true,
	transformOrigin: true,
	widows: true,
	zIndex: true,
	zoom: true
};

export function patchStyle(lastAttrValue, nextAttrValue, dom) {
	if (isString(nextAttrValue)) {
		dom.style.cssText = nextAttrValue;
	} else if (isNullOrUndefined(lastAttrValue)) {
		if (!isNullOrUndefined(nextAttrValue)) {
			const styleKeys = Object.keys(nextAttrValue);

			for (let i = 0; i < styleKeys.length; i++) {
				const style = styleKeys[i];
				let value = nextAttrValue[style];

				if (isNumber(value) && !canBeUnitlessProperties[style]) {
					value = value + 'px';
				}
				dom.style[style] = value;
			}
		}
	} else if (isNullOrUndefined(nextAttrValue)) {
		dom.removeAttribute('style');
	} else {
		const styleKeys = Object.keys(nextAttrValue);

		for (let i = 0; i < styleKeys.length; i++) {
			const style = styleKeys[i];
			let value = nextAttrValue[style];

			if (isNumber(value) && !canBeUnitlessProperties[style]) {
				value = value + 'px';
			}
			dom.style[style] = value;
		}
		const lastStyleKeys = Object.keys(lastAttrValue);

		for (let i = 0; i < lastStyleKeys.length; i++) {
			const style = lastStyleKeys[i];
			if (isNullOrUndefined(nextAttrValue[style])) {
				dom.style[style] = '';
			}
		}
	}
}

export function patchAttribute(attrName, nextAttrValue, dom) {
	if (!isAttrAnEvent(attrName)) {
		if (booleanProps(attrName)) {
			dom[attrName] = nextAttrValue;
			return;
		}
		if (nextAttrValue === false || isNullOrUndefined(nextAttrValue)) {
			dom.removeAttribute(attrName);
		} else {
			let ns = null;

			if (attrName[5] === ':' && attrName.indexOf('xlink:') !== -1) {
				ns = 'http://www.w3.org/1999/xlink';
			}
			if (ns !== null) {
				dom.setAttributeNS(ns, attrName, nextAttrValue === true ? attrName : nextAttrValue);
			} else {
				dom.setAttribute(attrName, nextAttrValue === true ? attrName : nextAttrValue);
			}
		}
	}
}

export function patchComponent(lastNode, Component, instance, lastProps, nextProps, nextHooks, nextChildren, parentDom, lifecycle, context) {
	nextProps = addChildrenToProps(nextChildren, nextProps);

	if (isStatefulComponent(Component)) {
		const prevProps = instance.props;
		const prevState = instance.state;
		const nextState = instance.state;

		const childContext = instance.getChildContext();
		if (!isNullOrUndefined(childContext)) {
			context = { ...context, ...childContext };
		}
		instance.context = context;
		const nextNode = instance._updateComponent(prevState, nextState, prevProps, nextProps);

		if (!isNullOrUndefined(nextNode)) {
			diffNodes(lastNode, nextNode, parentDom, null, lifecycle, context, true, instance);
			lastNode.dom = nextNode.dom;
			instance._lastNode = nextNode;
		}
	} else {
		let shouldUpdate = true;
		const nextHooksDefined = !isNullOrUndefined(nextHooks);

		if (nextHooksDefined && !isNullOrUndefined(nextHooks.componentShouldUpdate)) {
			shouldUpdate = nextHooks.componentShouldUpdate(lastNode.dom, lastProps, nextProps);
		}
		if (shouldUpdate !== false) {
			if (nextHooksDefined && !isNullOrUndefined(nextHooks.componentWillUpdate)) {
				nextHooks.componentWillUpdate(lastNode.dom, lastProps, nextProps);
			}
			const nextNode = Component(nextProps);
			const dom = lastNode.dom;
			nextNode.dom = dom;

			diffNodes(instance, nextNode, dom, null, lifecycle, context, true, null);
			lastNode.instance = nextNode;
			if (nextHooksDefined && !isNullOrUndefined(nextHooks.componentDidUpdate)) {
				nextHooks.componentDidUpdate(lastNode.dom, lastProps, nextProps);
			}
		}
	}
}

function isKeyed(lastChildren, nextChildren) {
	return nextChildren.length && !isNullOrUndefined(nextChildren[0]) && !isNullOrUndefined(nextChildren[0].key)
		|| lastChildren.length && !isNullOrUndefined(lastChildren[0]) && !isNullOrUndefined(lastChildren[0].key);
}

export function patchNonKeyedChildren(lastChildren, nextChildren, dom, domChildren, namespace, lifecycle, context, instance, domChildrenIndex) {
	const isVirtualFragment = !isNullOrUndefined(dom.append);
	let lastChildrenLength = lastChildren.length;
	let nextChildrenLength = nextChildren.length;
	const sameLength = lastChildrenLength === nextChildrenLength;

	if (sameLength === false) {
		if (lastChildrenLength > nextChildrenLength) {
			while (lastChildrenLength !== nextChildrenLength) {
				const lastChild = lastChildren[lastChildrenLength - 1];

				if (!isInvalidNode(lastChild)) {
					dom.removeChild(domChildren[lastChildrenLength - 1 + domChildrenIndex]);
					detachNode(lastChild);
				}
				lastChildrenLength--;
			}
		} else if (lastChildrenLength < nextChildrenLength) {
			while (lastChildrenLength !== nextChildrenLength) {
				const nextChild = nextChildren[lastChildrenLength];
				const domNode = mountNode(nextChild, null, namespace, lifecycle, context, instance);

				insertOrAppend(dom, domNode);
				!isVirtualFragment && domChildren.push(domNode);
				lastChildrenLength++;
			}
		}
	}
	for (let i = 0; i < nextChildrenLength; i++) {
		const lastChild = lastChildren[i];
		const nextChild = nextChildren[i];
		const index = i + domChildrenIndex;

		if (lastChild !== nextChild) {
			if (isInvalidNode(nextChild)) {
				if (!isInvalidNode(lastChild)) {
					const childNode = domChildren[index];

					if (!isNullOrUndefined(childNode)) {
						if (isStringOrNumber(lastChild)) {
							childNode.nodeValue = '';
						} else if (sameLength === true) {
							const textNode = createEmptyTextNode();

							if (isArray(lastChild) && lastChild.length === 0) {
								insertOrAppend(dom, textNode);
								!isVirtualFragment && domChildren.splice(index, 0, textNode);
							} else {
								dom.replaceChild(textNode, domChildren[index]);
								!isVirtualFragment && domChildren.splice(index, 1, textNode);
								detachNode(lastChild, recyclingEnabled && !isNullOrUndefined(lastChild.tpl));
							}
						}
					}
				}
			} else {
				if (isInvalidNode(lastChild)) {
					if (isStringOrNumber(nextChild)) {
						const textNode = document.createTextNode(nextChild);
						dom.replaceChild(textNode, domChildren[index]);
						!isVirtualFragment && domChildren.splice(index, 1, textNode);
					} else if (sameLength === true) {
						const domNode = mountNode(nextChild, null, namespace, lifecycle, context, instance);
						dom.replaceChild(domNode, domChildren[index]);
						!isVirtualFragment && domChildren.splice(index, 1, domNode);
					}
				} else if (isObject(nextChild)) {
					if (isArray(nextChild)) {
						if (isKeyed(lastChild, nextChild)) {
							patchKeyedChildren(lastChild, nextChild, domChildren[index], namespace, lifecycle, context, instance);
						} else {
							if (isArray(lastChild)) {
								patchNonKeyedChildren(lastChild, nextChild, domChildren[index], domChildren[index].childNodes, namespace, lifecycle, context, instance, 0);
							} else {
								patchNonKeyedChildren([lastChild], nextChild, dom, domChildren, namespace, lifecycle, context, instance, i);
							}
						}
					} else {
						if (isArray(lastChild)) {
							patchNonKeyedChildren(lastChild, [nextChild], domChildren, domChildren[index].childNodes, namespace, lifecycle, context, instance, 0);
						} else {
							patchNode(lastChild, nextChild, dom, namespace, lifecycle, context, instance);
						}
					}
				} else if (isStringOrNumber(nextChild)) {
					const textNode = document.createTextNode(nextChild);
					if (isNullOrUndefined(domChildren[index])) {
						// textNode => textNode
						dom.nodeValue = textNode.nodeValue;
					} else {
						dom.replaceChild(textNode, domChildren[index]);
						!isVirtualFragment && domChildren.splice(index, 1, textNode);
					}
					detachNode(lastChild, recyclingEnabled && !isNullOrUndefined(lastChild.tpl));
				}
			}
		}
	}

	/*
	if (isNullOrUndefined(childNode)) {
		debugger;
		const textNode = document.createTextNode('');

		dom.appendChild(textNode);
		!isVirtualFragment && domChildren.push(textNode);
	} else {
		if (isStringOrNumber(lastChild)) {
			childNode.nodeValue = nextChild;
		} else {
			childNode.textContent = nextChild;
		}
	}
	*/
}

export function patchKeyedChildren(lastChildren, nextChildren, dom, namespace, lifecycle, context, instance) {
	let nextChildrenLength = nextChildren.length;
	let lastChildrenLength = lastChildren.length;
	if (nextChildrenLength === 0 && lastChildrenLength >= 5) {
		if (recyclingEnabled) {
			for (let i = 0; i < lastChildrenLength; i++) {
				pool(lastChildren[i]);
			}
		}
		dom.textContent = '';
		return;
	}
	let oldItem;
	let stop = false;
	let startIndex = 0;
	let oldStartIndex = 0;
	let endIndex = nextChildrenLength - 1;
	let oldEndIndex = lastChildrenLength - 1;
	let oldStartItem = (lastChildrenLength > 0) ? lastChildren[oldStartIndex] : null;
	let startItem = (nextChildrenLength > 0) ? nextChildren[startIndex] : null;
	let endItem;
	let oldEndItem;
	let nextNode;

	// TODO don't read key too often
	outer: while (!stop && startIndex <= endIndex && oldStartIndex <= oldEndIndex) {
		stop = true;
		while (startItem.key === oldStartItem.key) {
			diffNodes(oldStartItem, startItem, dom, namespace, lifecycle, context, true, instance);
			startIndex++;
			oldStartIndex++;
			if (startIndex > endIndex || oldStartIndex > oldEndIndex) {
				break outer;
			} else {
				startItem = nextChildren[startIndex];
				oldStartItem = lastChildren[oldStartIndex];
				stop = false;
			}
		}
		endItem = nextChildren[endIndex];
		oldEndItem = lastChildren[oldEndIndex];
		while (endItem.key === oldEndItem.key) {
			diffNodes(oldEndItem, endItem, dom, namespace, lifecycle, context, true, instance);
			endIndex--;
			oldEndIndex--;
			if (startIndex > endIndex || oldStartIndex > oldEndIndex) {
				break outer;
			} else {
				endItem = nextChildren[endIndex];
				oldEndItem = lastChildren[oldEndIndex];
				stop = false;
			}
		}
		while (endItem.key === oldStartItem.key) {
			nextNode = (endIndex + 1 < nextChildrenLength) ? nextChildren[endIndex + 1].dom : null;
			diffNodes(oldStartItem, endItem, dom, namespace, lifecycle, context, true, instance);
			insertOrAppend(dom, endItem.dom, nextNode);
			endIndex--;
			oldStartIndex++;
			if (startIndex > endIndex || oldStartIndex > oldEndIndex) {
				break outer;
			} else {
				endItem = nextChildren[endIndex];
				oldStartItem = lastChildren[oldStartIndex];
				stop = false;
			}
		}
		while (startItem.key === oldEndItem.key) {
			nextNode = lastChildren[oldStartIndex].dom;
			diffNodes(oldEndItem, startItem, dom, namespace, lifecycle, context, true, instance);
			insertOrAppend(dom, startItem.dom, nextNode);
			startIndex++;
			oldEndIndex--;
			if (startIndex > endIndex || oldStartIndex > oldEndIndex) {
				break outer;
			} else {
				startItem = nextChildren[startIndex];
				oldEndItem = lastChildren[oldEndIndex];
				stop = false;
			}
		}
	}

	if (oldStartIndex > oldEndIndex) {
		if (startIndex <= endIndex) {
			nextNode = (endIndex + 1 < nextChildrenLength) ? nextChildren[endIndex + 1].dom : null;
			for (; startIndex <= endIndex; startIndex++) {
				insertOrAppend(dom, mountNode(nextChildren[startIndex], null, namespace, lifecycle, context, instance), nextNode);
			}
		}
	} else if (startIndex > endIndex) {
		for (; oldStartIndex <= oldEndIndex; oldStartIndex++) {
			oldItem = lastChildren[oldStartIndex];
			remove(oldItem, dom);
		}
	} else {
		const oldItemsMap = [];

		for (let i = oldStartIndex; i <= oldEndIndex; i++) {
			oldItem = lastChildren[i];
			oldItemsMap[oldItem.key] = oldItem;
		}
		nextNode = (endIndex + 1 < nextChildrenLength) ? nextChildren[endIndex + 1] : null;

		for (let i = endIndex; i >= startIndex; i--) {
			const item = nextChildren[i];
			const key = item.key;
			oldItem = oldItemsMap[key];
			nextNode = isNullOrUndefined(nextNode) ? undefined : nextNode.dom; // Default to undefined instead null, because nextSibling in DOM is null
			if (oldItem === undefined) {
				insertOrAppend(dom, mountNode(item, null, namespace, lifecycle, context, instance), nextNode);
			} else {
				oldItemsMap[key] = null;
				diffNodes(oldItem, item, dom, namespace, lifecycle, context, true, instance);

				if (item.dom.nextSibling !== nextNode) {
					insertOrAppend(dom, item.dom, nextNode);
				}
			}
			nextNode = item;
		}
		for (let i = oldStartIndex; i <= oldEndIndex; i++) {
			oldItem = lastChildren[i];
			if (oldItemsMap[oldItem.key] !== null) {
				remove(oldItem, dom);
			}
		}
	}
}
