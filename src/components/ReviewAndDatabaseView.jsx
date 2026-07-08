// src/components/ReviewAndDatabaseView.jsx
import React from 'react';
import SegmentedControl from './SegmentedControl';
import ReviewView from './ReviewView';
import MonthlyView from './MonthlyView';

const ReviewAndDatabaseView = ({
  assets,
  combinedHistory,
  loadArchiveMonth,
  isFetchingArchive,
  setAssets,
  currentFxRate,
  onTransaction,
  customAlert,
  customConfirm,
  customPrompt,
  newlyAddedRecordTimestamp,
  subTab,
  onChangeSubTab,
  onDelete,
  onEdit,
  sendLineNotification,
  currentUser,
  logOperation
}) => {
  return (
    <div className="page-transition-enter">
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '18px', padding: '0 16px' }}>
        <SegmentedControl
          options={[
            { label: '每月回顧 📖', value: 'review' },
            { label: '財務資料庫 📊', value: 'database' }
          ]}
          value={subTab}
          onChange={onChangeSubTab}
        />
      </div>

      {subTab === 'review' ? (
        <ReviewView
          key="review-sub"
          assets={assets}
          combinedHistory={combinedHistory}
          loadArchiveMonth={loadArchiveMonth}
        />
      ) : (
        <MonthlyView
          key="monthly-sub"
          assets={assets}
          combinedHistory={combinedHistory}
          loadArchiveMonth={loadArchiveMonth}
          isFetchingArchive={isFetchingArchive}
          setAssets={setAssets}
          currentFxRate={currentFxRate}
          onTransaction={onTransaction}
          customAlert={customAlert}
          customConfirm={customConfirm}
          customPrompt={customPrompt}
          newlyAddedRecordTimestamp={newlyAddedRecordTimestamp}
          onDelete={onDelete}
          onEdit={onEdit}
          sendLineNotification={sendLineNotification}
          currentUser={currentUser}
          logOperation={logOperation}
        />
      )}
    </div>
  );
};

export default ReviewAndDatabaseView;
