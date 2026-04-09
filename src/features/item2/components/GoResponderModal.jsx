/**
 * 向かう人モーダル
 */

import React from 'react';
import AssigneeModal from './AssigneeModal';

/**
 * 向かう人モーダル
 * @param {Object} props - プロパティ
 * @returns {JSX.Element} モーダル
 */
const GoResponderModal = (props) => {
  return <AssigneeModal {...props} />;
};

export default GoResponderModal;
